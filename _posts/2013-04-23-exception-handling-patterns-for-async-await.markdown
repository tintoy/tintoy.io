---
author: tintoy
comments: true
date: 2013-04-23 11:25:12+10:00
layout: post
slug: exception-handling-patterns-for-async-await
title: Exception-handling patterns for async / await
wordpress_id: 611
---

I've spent the last 6 weeks or so working on a Windows Store app. WinRT is an interesting platform, although there are definitely some irritating design-decisions that Microsoft have made.

One of the more egregious examples of this is the way they _force_ all I/O to be asynchronous. This more-or-less forces you to rely on the [async / await](http://msdn.microsoft.com/en-us/library/vstudio/hh191443.aspx) pattern all the way up and down the call-stack.

It could be worse, of course; without `async` / `await`, we'd have to rely on hand-crafted continuations, which would make the code just-about unreadable.

One of the biggest difficulties however, arising from this enforced adoption of `async` / `await`, is in implementing recovery strategies in response to exceptions arising within an async method.
<!-- more -->
For example, this simplified example demonstrates how you might implement the (synchronous) robust save of a small-to-medium data file:

```csharp
string storeFilePath = StoreManager.CurrentStoreFilePath;

// Create a backup of the store file, in case something goes wrong with the save.
string backupStoreFilePath = Path.ChangeExtension(storeFilePath, ".save-temp");
File.Copy(storeFilePath, backupStoreFilePath, true);

try
{
    using (FileStream storeStream = new FileStream(storeFilePath, FileMode.Create))
    {
        StoreSerializer.PersistStore(storeStream);
    }
}
catch (SerializationException eSerializationFailure)
{
    Logger.StoreSaveFailed(storeFilePath, eSerializationFailure);

    // Restore the backup copy of the store file.
    File.Copy(backupStoreFilePath, storeFilePath);
}
finally
{
	if (File.Exists(backupStoreFilePath))
		File.Delete(backupStoreFilePath);
}
```

One limitation of `async` / `await`, however, is that you cannot `await` anything within a `catch` or `finally` block (incidentally, there is no WinRT method to check if a file exists, other than catching a FileNotFoundException - what the hell, guys?).

A slightly different approach is therefore required.
Here is an example adapted from the Zelik codebase:
```csharp
/// <summary>
///		Asynchronously back up the current store file, if it exists and is newer than the most recent store backup file.
/// </summary>
/// <param name="suffix">
///		The suffix to add to the store file name.
///		Defaults to "Backup".
/// </param>
/// <param name="cancellationToken">
///		An optional cancellation token that can be used to cancel the backup operation.
/// </param>
/// <returns>
///		A <see cref="Task"/> representing the backup operation.
/// </returns>
async Task BackupCurrentStoreFileAsync(string suffix = "Backup", CancellationToken cancellationToken = default(CancellationToken))
{
	if (String.IsNullOrWhiteSpace(suffix))
		throw new ArgumentException("Argument cannot be null, empty, or composed entirely of whitespace: 'suffix'.", "suffix");

	StorageFolder storeFolder = null;
	bool success = true;
	try
	{
		storeFolder = await
            ApplicationData.Current.LocalFolder.GetFolderAsync(
                StoreManager.DefaultStoreFolderPath
            )
			.AsTask(cancellationToken)
			.ConfigureAwait(false);
	}
	catch (Exception eDirectoryNotFound)
	{
		success = false;
	}

	if (!success)
		return;

	Contract.Assert(storeFolder != null, "Did not get store folder.");

	StorageFile currentStoreFile = null;
	try
	{
		currentStoreFile = await
			storeFolder.GetFileAsync(StoreManager.DefaultStoreFileName)
				.AsTask(cancellationToken)
				.ConfigureAwait(false);
	}
	catch (FileNotFoundException)
	{
	}

	if (currentStoreFile == null)
		return; // No existing store, so nothing to do.

	BasicProperties currentStoreFileProperties = await
		currentStoreFile.GetBasicPropertiesAsync();

	cancellationToken.ThrowIfCancellationRequested();

	DateTimeOffset currentStoreModificationTime = currentStoreFileProperties.DateModified;

	// Get a list of all existing backup files.
	StorageFolder backupFolder =
		await
			ApplicationData
				.Current
				.LocalFolder
				.CreateFolderAsync(
					StoreManager.DefaultStoreBackupFolderPath,
					CreationCollisionOption.OpenIfExists
				)
				.AsTask(cancellationToken)
				.ConfigureAwait(false);
	QueryOptions backupFileQueryOptions = new QueryOptions
	{
		FolderDepth = FolderDepth.Shallow,
		FileTypeFilter =
		{
			".xml"
		},
		SortOrder =
		{
			new SortEntry
			{
				PropertyName = "System.DateModified",
				AscendingOrder = true
			}
		}
	};
	List<StorageFile> backupFiles =
		new List<StorageFile>(
			await
				backupFolder
					.CreateFileQueryWithOptions(backupFileQueryOptions)
					.GetFilesAsync()
					.AsTask(cancellationToken)
					.ConfigureAwait(false)
		);

	StorageFile latestBackupFile = null;
	if (backupFiles.Count > 0)
	{
		latestBackupFile = backupFiles[backupFiles.Count - 1];
		Contract.Assert(latestBackupFile != null, "latestBackupFile != null");
	}

	DateTimeOffset lastStoreBackupTime = DateTimeOffset.MinValue;
	if (latestBackupFile != null)
	{
		BasicProperties latestBackupFileProperties =
			await
				latestBackupFile
					.GetBasicPropertiesAsync()
					.AsTask(cancellationToken)
					.ConfigureAwait(false);

		lastStoreBackupTime = latestBackupFileProperties.DateModified;
	}

	// Do we need to back up now?
	if (currentStoreModificationTime <= lastStoreBackupTime)
		return; // Nope.

	//////////////////////////////////////////////////////////////////////////
	// Operation is no-longer cancellable after this point (risk of data-loss)

	string backupFileName = String.Format("{0}_{1}_{2}.xml",
		Path.GetFileNameWithoutExtension(
			currentStoreFile.Name
		),
		suffix,
		DateTime.UtcNow.Ticks
	);

	try
	{
		StorageFile backupFile = await backupFolder.CreateFileAsync(
            backupFileName,
            CreationCollisionOption.ReplaceExisting
        );
        await currentStoreFile.CopyAndReplaceAsync(backupFile);

		Log.StoreBackup(StoreManager.DefaultStoreFilePath, backupFileName);
	}
	catch (Exception eBackupStore)
	{
		Log.StoreBackupFailure(StoreManager.DefaultStoreFilePath, backupFileName, eBackupStore);

		return;
	}

	// Delete obsolete store backup files.
	int expiredBackupFileCount = backupFiles.Count - (Constants.MaxStoreBackupFiles - 1); // 0-based indexing.
	for (int expiredBackupFileIndex = 0; expiredBackupFileIndex < expiredBackupFileCount; expiredBackupFileIndex++)
	{
		await backupFiles[expiredBackupFileIndex].DeleteAsync();
	}
}
```

Now, it's worth pointing out that this code is more verbose than it needs to be; you can often specify a sub-path when retrieving files and folders (rather than having to directly fetch the parent item), but I've tried to make this code as explicit as possible to demonstrate what's involved.

The important thing to note, here, is that catch blocks simply save the exceptions into local variables (or set success / failure flags), which are then examined to determine the subsequent course of action.

One other thing worth noting is that [local variables wind up being closed over as part of the compiler's async state-machine generation process](http://msdn.microsoft.com/en-us/magazine/hh456402.aspx), and can wind up being boxed on the heap for an indeterminate period of time. So be careful with the number of variables declared in an async method (or remember to null them out if they are no-longer needed).
