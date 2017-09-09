---
author: tintoy
comments: true
layout: post
slug: streaming-docker-events-to-akka-dotnet
title: "Streaming docker events to Akka.NET"
categories:
  - Akka.NET
  - Akka.NET I/O
  - Docker
  - Streaming
---

Most operations on the Docker API simply do their work (or _start_ doing their work) and then return single response. Until work is complete, the client is blocked waiting for a response.

For more long-running operations (e.g. "build image", "monitor container events"), the API returns a stream of events which only closes once the operation is complete. In most of these cases ("get container logs" being a notable exception), the stream simply consists of multiple lines of text each containing JSON-serialised event data. So clients can simply keep reading from the stream until they have a full line of text (terminated with `\n`) and then deserialise an event from the line's content.

Here's a quick example of how you might do this in C#:

```csharp
async Task StreamFiveEvents(DockerClient client)
{
  // Stream forever.
  var parameters = new ContainerEventsParameters();
  using (Stream responseStream = await client.Misc.MonitorEventsAsync(parameters, CancellationToken.None))
  using (StreamReader streamReader = new StreamReader(responseStream))
  {
    string eventText = await streamReader.ReadLineAsync();
    while (eventText != null)
    {
      DockerEvent dockerEvent = JsonConvert.Deserialize<DockerEvent>(eventText);
      
      // Do something with dockerEvent.

      eventText = await streamReader.ReadLineAsync();
    }
  }
}

```

So, why make use of `async` here? You could probably get away with a fully-synchronous version, but if you're going to do this inside an Akka actor, good practice is to avoid blocking your actor's dispatcher (too many blocked actors and you may risk thread-pool exhaustion).

What might a streaming actor look like?

```csharp
class EventStreamer : ReceiveActor
{
  readonly IActorRef _target;
  readonly DockerClient _client;
  
  StreamReader _eventReader;

  public EventStreamer(IActorRef target, DockerClient client)
  {
    _target = target;
    _client = client;

    Receive<string>(eventLine =>
    {
      // End of stream?
      if (eventLine == null)
      {
        Context.Stop(Self);
      }

      DockerEvent eventData = JsonConvert.Deserialize<DockerEvent>(eventLine);
      target.Tell(eventData);

      // Kick off the next read.
      _eventReader.ReadLineAsync().PipeTo(Self);
    });

    Receive<Stream>(eventStream =>
    {
      _eventReader = new StreamReader(eventStream);

      // Kick off the initial read.
      _eventReader.ReadLineAsync().PipeTo(Self);
    });

    // MonitorEventsAsync or ReadLineAsync failed.
    Receive<Failure>(failure =>
    {
      // TODO: Log failure

      Context.Stop(Self);

      return;
    });
  }

  override void PreStart()
  {
    base.PreStart();

    // Start monitoring events.
    _client.Misc.MonitorEventsAsync(parameters, CancellationToken.None).PipeTo(Self);
  }

  override void PostStop()
  {
    if (_eventReader != null)
    {
      _eventReader.Dispose();
      _eventReader = null;
    }

    base.PostStop();
  }
}
```

This implementation has been simplified, but the basic idea still holds. The actor does not block when waiting for I/O to complete.

## Akka I/O

Akka I/O is a useful model for integrating I/O-bound activities into an Akka actor system. Although it is primarily targeted at network I/O, its model for streaming is well-thought-out and a good match for many similar activities.

## Akka Streams

Akka Streams is the preferred model for streaming data (especially data from I/O-bound data sources) in Akka.NET.

Unfortunately, much of Akka Streams is not yet available in the early builds of Akka.NET for .NET Core so we can't use it here.