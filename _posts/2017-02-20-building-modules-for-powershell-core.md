---
author: tintoy
comments: true
date: 2017-02-20 09:48:00+11:00
layout: post
slug: building-modules-for-powershell-core
title: "Building modules for PowerShell Core"
categories:
  - Powershell
  - .NET Core
---

[Want to skip ahead to the sample module code?](#building-a-binary-module)

As a developer I've long been a fan of Powershell; while there are other shells out there (such as [Xonsh](http://xon.sh/)) that can do similar things, I tend to keep coming back to PowerShell as an automation language on Windows.
Not only does it have a relatively large library of modules available for automating almost every aspect of Windows and related technologies, but the language itself is also surprisingly sophisticated; take parameter sets, for example:

Cmdlets are a lot like functions; they take parameters, and return outputs. What uniquely identifies a Cmdlet is its name ("Verb-Noun", more or less) and because everything is strongly typed PowerShell can not only tell you if you make a mistake but even suggest correct syntax (i.e. auto-complete). With parameter sets you can declare which combinations of parameters are valid together, while also documenting the scenario targeted by a particular combination of parameters. And standard operators work the way you'd expect:

```powershell
$items = @('foo', 'bar')
$items += 'baz'

# Items is now ['foo', 'bar', 'baz']
```

Outside of the Windows world, however, Powershell has obviously had little traction until now.

## Core

PowerShell Core (v6.0) is the cross-platform version of Microsoft Powershell; it's built on .NET Core (and the source can be quite instructive when it comes to the more esoteric aspects of .NET Core infrastructure APIs).
If you have existing Powershell scripts or modules, then it's probably your best bet if you want to target any of the following operating systems:

* Windows NanoServer
* Linux
* MacOS

(I don't think regular PowerShell is going away, but it's worth pointing out that like .NET Core, it also works on regular Windows).

## Modules

In Powershell, a module groups related functions, Cmdlets, and providers, into a single package that can be utilised via `Import-Module`.

There are 3 main ways to write PowerShell modules (I'm going to ignore snap-ins because, ugh, why would you ever):

* Script modules (`.psm1`)
* Binary modules (`.dll`)
* Manifest modules (`.psd1`)

### Script modules

Script modules are written almost entirely in the PowerShell scripting language.

#### Disadvantages of script modules

* The PowerShell language is general-purpose, but not well suited to some kinds of tasks.  
Yes, you can bend it to do just about anything but make sure that the benefits of doing so outweigh the costs (i.e. just because you can, doesn't mean you should).
* Script modules are also a little harder to maintain. PowerShell is strongly-typed, but also dynamically typed. So you'll need to write plenty of tests if quality is important (some would argue this is not a disadvantage).

#### Advantages of script modules

* Low barrier to entry - all you need is a text editor and, given enough time and swearing, you can build a module that does just about anything.
* Help for your functions and Cmdlets is automatically extracted from doc comments, providing they [follow the standard conventions](https://msdn.microsoft.com/en-us/powershell/reference/5.1/microsoft.powershell.core/about/about_comment_based_help).
* While the PowerShell language used to have limitations that made building complex modules quite painful, this has been somewhat mitigated by recent additions such as support for classes, enums, and even [inline types](https://msdn.microsoft.com/en-us/powershell/reference/5.0/microsoft.powershell.utility/add-type#example-1-add-a-net-type-to-a-session).

### Binary modules

Binary modules are managed assemblies that use and extend types from `System.Management.Automation` (although what your project references is typically `Microsoft.PowerShell.SDK`).

#### Disadvantages of binary modules

* Writing help for binary modules is a bit more involved, unfortunately.  
Cmdlet help is written in a (somewhat obtuse) format called [MAML](https://en.wikipedia.org/wiki/Microsoft_Assistance_Markup_Language) (the Microsoft Assistance Markup Language), and it's a pain to author from scratch.
  * While the `[Parameter]` attribute allows you to specify a help message for a Cmdlet parameter, this isn't actually displayed in help (it's only used when prompting for missing parameter values). There's also no attribute that can specify the synopsis or description for a Cmdlet.  
  * For this reason, I built a little tool called [Reptile](https://github.com/tintoy/ps-reptile) (teehee) that scans the module assembly for metadata and generates a help file for using content from custom attributes applied to Cmdlet classes.

#### Advantages of binary modules

* Binary modules written in C#, VB.NET, or other languages that target the CLR are often easier to maintain than PowerShell script code.
* You have the full power of the .NET framework (ok, well, .NET Core in this case) and the ability to call native code, if necessary (again, you can probably work out how to do this from script code but it's arguably more work than just building a binary module).

### Manifest modules

Manifest modules are modules whose top-level file is a manifest (`.psd1`). They can include any number of submodules (whether script, binary, or manifest).

The manifest provides a detailed description of the module and its contents. For example:

```powershell
#
# Powershell module manifest for CloudControl.
#
# adam.friedman@itaas.dimensiondata.com

@{
	# Script module or binary module file associated with this manifest.
	RootModule = 'DD.CloudControl.Powershell.dll'

	# Version number of this module.
	ModuleVersion = '1.0'

	# ID used to uniquely identify this module
	GUID = '6b922a5b-b3da-4082-b66c-29f9a4250f81'

	# Author of this module
	Author = 'adam.friedman@itaas.dimensiondata.com'

	# Company or vendor of this module
	CompanyName = 'Dimension Data'

	# Copyright statement for this module
	Copyright = 'Copyright (c) 2017 Dimension Data'

	# Description of the functionality provided by this module
	Description = 'CloudControl'

	# Minimum version of the Windows PowerShell engine required by this module
	PowerShellVersion = '6.0'

	# Type files (.ps1xml) to be loaded when importing this module
	TypesToProcess = @('DD.CloudControl.Powershell.types.ps1xml')

	# Format files (.ps1xml) to be loaded when importing this module
	FormatsToProcess = @('DD.CloudControl.Powershell.format.ps1xml')

	# Export all Cmdlets
	CmdletsToExport = '*'

	# List of all modules packaged with this module
	ModuleList = @('CloudControl')
}
```

There are many more options you can put in your manifest - have a look at [the docs](https://msdn.microsoft.com/en-us/library/dd878337.aspx) (or run `Get-Help New-ModuleManifest -Detailed`) if you're interested.

If you want to include custom type definitions or formatting directives, a manifest-based module is what you want (regardless if whether the underlying module is script-based or binary).

## Building a binary module

The tooling for .NET Core (and, consequently, PowerShell Core) module authors hasn't quite stabilised yet, so these instructions may not be good after RC4.
Assuming you are using the [RC4 tooling](https://github.com/dotnet/core/blob/master/release-notes/rc4-download.md), this is all you have to do in order to get your module working:

1. `mkdir TestModule; cd TestModule`.
2. `dotnet new lib`.

Open `TestModule.csproj`.
  
```xml
<Project Sdk="Microsoft.NET.Sdk">

  <PropertyGroup>
    <TargetFramework>netstandard1.4</TargetFramework>
  </PropertyGroup>

</Project>
```

First off, we need to make a couple of small changes to `TestModule.csproj`:

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <!--
		PowerShell core requires the NETStandard 1.6.1 package
		(this is still .NET Standard 1.6, but a newer version of its constituent libraries)
	-->
    <NetStandardImplicitPackageVersion>1.6.1</NetStandardImplicitPackageVersion>
  </PropertyGroup>

  <PropertyGroup>
  	<!--
	  	PowerShell Core requires .NET Standard 1.6
		(the RC4 tooling generates libraries that target netstandard1.4 by default)
	-->
    <TargetFramework>netstandard1.6</TargetFramework>
  </PropertyGroup>

  <!-- Powershell Core v6.0.0-alpha13 -->
  <ItemGroup>
    <PackageReference Include="Microsoft.PowerShell.SDK" Version="6.0.0-alpha13"/>
    <PackageReference Include="Microsoft.NETCore.Portable.Compatibility" Version="1.0.3-beta-24514-00"/>
  </ItemGroup>

  <!--
    Used for help-related custom attributes; you can leave it out if you don't need it
  -->
  <ItemGroup>
  	<PackageReference Include="PSReptile" Version="0.0.1-alpha1"/>
  </ItemGroup>
</Project>
```

Run `dotnet restore`, and we're ready to add our first Cmdlet:

```csharp
using PSReptile;
using System.Management.Automation;

namespace SimpleModule
{
    /// <summary>
    ///     A simple Cmdlet that outputs a greeting to the pipeline.
    /// </summary>
	[OutputType(typeof(string))]
    [Cmdlet(VerbsCommon.Get, "Greeting")]
    [CmdletSynopsis("A simple Cmdlet that outputs a greeting to the pipeline")]
    [CmdletDescription(@"
        This Cmdlet works with greetings.
        Give it your name, and it will greet you.
    ")]
    public class GetGreeting
        : Cmdlet
    {
        /// <summary>
        ///     The name of the person to greet.
        /// </summary>
        [ValidateNotNullOrEmpty]
        [Parameter(Mandatory = true, Position = 0, HelpMessage = "The name of the person to greet")]
        public string Name { get; set; }

        /// <summary>
        ///     Perform Cmdlet processing.
        /// </summary>
        protected override void ProcessRecord()
        {
            WriteObject($"Hello, {Name}!");
        }
    }
}
```

This Cmdlet (`Get-Greeting`) is simplistic but relatively full-featured. It takes a name (either as `-Name xxx` or as the first parameter, simply `xxx`), and writes a greeting to the pipeline.

To actually load your module you'll need to publish it by running `dotnet publish -c release` (this will also copy the assemblies your module depends on to the publish directory).

You can then open Powershell and run:

```powershell
Import-Module './bin/release/netstandard1.6/publish/TestModule.dll'

Get-Greeting -Name 'World'
```

### Cmdlets that call async APIs

Sooner or later, most PowerShell modules wind up calling `HttpClient` and friends to connect to remote APIs. While you can simply use `client.Get("http://foo/bar").Result` to synchronously retrieve the response, it's non-idiomatic (not to mention prone to deadlock).
Simply using `async` / `await` to call asynchronous APIs is also problematic, however, because Cmdlets _really_ don't like to be accessed from any thread other than the one that created them.

So a while back, I built a base class called [AsyncCmdlet](https://github.com/DimensionDataResearch/cloudcontrol-powershell-core/blob/master/src/DD.CloudControl.Powershell/AsyncCmdlet.cs) (this being its latest incarnation) that takes care of running asynchronous operations with a special `SynchronizationContext` that ensures callbacks are always run on the Cmdlet's owning thread (so you can both use `async` / `await` and feel free to call Cmdlet base class methods).

It even offers overloads that support cancellation (via a `CancellationToken`):

```csharp
/// <summary>
///     Cmdlet that retrieves information about one or more CloudControl user accounts.
/// </summary>
[OutputType(typeof(UserAccount))]
[Cmdlet(VerbsCommon.Get, Nouns.UserAccount)]
public class GetCloudControlUserAccount
	: CloudControlCmdlet // Inherits from AsyncCmdlet
{
	/// <summary>
	///     Retrieve the current user's account details.
	/// </summary>
	[Parameter(Mandatory = true)]
	public SwitchParameter My { get; set; }

	/// <summary>
	///     Asynchronously perform Cmdlet processing.
	/// </summary>
	/// <param name="cancellationToken">
	///     A <see cref="CancellationToken"/> that can be used to cancel Cmdlet processing.
	/// </param>
	/// <returns>
	///     A <see cref="Task"/> representing the asynchronous operation.
	/// </returns>
	protected override async Task ProcessRecordAsync(CancellationToken cancellationToken)
	{
		CloudControlClient client = GetClient();

		WriteObject(
			await client.GetAccount(cancellationToken) // Cancellation support!
		);
	}
}
```
