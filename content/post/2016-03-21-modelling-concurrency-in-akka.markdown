---
author: tintoy
comments: true
date: 2016-03-21T09:09:31+11:00
layout: post
title: Modelling concurrency in Akka.NET
categories:
- Akka
- Architecture
- DDCloud
---

As a toolkit, Akka is useful for several reasons. In this series, the primary focus will be on how it can be used to model concurrency.
<!--more-->

This is the second in of a series of posts on Akka.NET and my experience of using it to re-implement one of the core parts of my employer's platform.
You can find the other parts here:
* [Part 1 - Adventures with Akka.NET](../2016-03-10-adventures-with-akka)

#### The actor model
Akka is based on [the actor model](https://en.wikipedia.org/wiki/Actor_model). Without plagiarising Wikipedia too deeply, here's a summary of the salient points:

* An actor is a computational entity that, in response to a message it receives, can perform one or more of the following:
  * Send one or more messages to other actors
  * Create one or more new actors
  * Designate the behavior to be used for the next message it receives

An important concept in actor systems is that actors only process a single incoming message at a time. This means the concurrency for an individual actor instance trivial to deal with; _for each individual actor, there is no concurrency_.

While this makes each actor's behaviour easy to reason about, it does beg the question of how concurrency _is_ achieved. The answer is that _concurrency is achieved by scaling out across multiple actors_.

#### Back to our domain model
Our provisioning engine's job is to run, err... jobs. Here's a simplification of a possible design for the provisioning engine:

![Provisioning Engine actors (stage 1)](../../../../../../images/2016/diagrams/engine-actors-stage-1.jpg)

Note that this system can only process a single job at a time because each actor can only process one message at a time.

In order to run multiple jobs, we could have multiple workers:

![Provisioning Engine actors (stage 2)](../../../../../../images/2016/diagrams/engine-actors-stage-2.jpg)

To control the level of concurrency, we simply need to control the number of workers (scaling them up and down as required).

##### But what about fairness?
This model gives us the ability to execute jobs concurrently, but there is effectively only a single queue for all jobs. What if we want to reserve capacity for individual customers / products?

Let's go one more flight up the spiral staircase and scale up the existing model again:

![Provisioning Engine actors (stage 3)](../../../../../../images/2016/diagrams/engine-actors-stage-3.jpg)

If we move the dispatcher and worker pool into a unit (in this case called a "Cell"), then we can treat each cell as a worker that can execute multiple jobs concurrently. If we then segregate cells by customer and / or product, we have a mechanism that allows us to tune the concurrency for each product and / or custom combination as required. With a little care, we can even support doing this on-the-fly without dropping any requests.

Note that we now have a top-level dispatcher (the "cell dispatcher") whose job it is to send each job to the relevant cell for processing.

#### Managing state across actors (Pull vs Push)
My original design had the dispatcher keeping track of all the available workers and their state and then pushing jobs to them. But this gets complicated rather quickly and for little overall benefit.

Instead, I settled on the following pattern of interaction.

1. The Worker becomes ready to execute a job
2. The Worker contacts its Dispatcher to register as available to execute a job
3. The Dispatcher schedules a dispatch operation (distribute all available jobs to all available workers)
4. The Dispatcher sends a job to the worker (and removes the worker from the list of available worker, additionally scheduling a timeout message to itself in case the worker fails to respond within the timeout period).
5. The Worker executes its job and sends it response to the Dispatcher.
6. The Dispatcher receives the response from the Worker and cancels the scheduled timeout message.
7. The worker becomes ready to execute another job
8. The Worker contacts its Dispatcher to register as available to execute a job
9. Rinse, repeat.

So the Dispatcher no longer knows how many workers there are, and only tracks workers that are available to execute jobs, or are actively executing jobs. And the workers, for their part, only need to manage their own state. If their hosting pool is being trimmed, they receive a GracefulStop message, and will stop as soon as their current job (if any) is complete.

This makes growing and shrinking each worker pool trivially easy.

The worker pool (code has been simplified for the purposes of demonstration):
```csharp
public sealed class JobWorkerPool
  : ReceiveActorEx
{
  readonly List<IActorRef>  _workers = new List<IActorRef>();

  readonly CellKey          _cellKey;

  readonly Props            _workerProps;

  int                       _poolSize;

  public JobWorkerPool(CellKey cellKey, Props workerProps, int poolSize)
  {
    if (workerProps == null)
      throw new ArgumentNullException(nameof(workerProps));

    if (poolSize < 1)
      throw new ArgumentOutOfRangeException(nameof(poolSize), poolSize, "Job worker pool size cannot be less than 1.");

    _cellKey = cellKey;
    _poolSize = poolSize;
    _workerProps = workerProps;
  }

  protected override void PreStart()
  {
    base.PreStart();

    Log.Debug("Starting job worker pool for {CellKey}...", _cellKey);

    for (int workerId = 0; workerId < _poolSize; workerId++)
      StartWorker($"worker-{workerId}");

    Log.Info("Job worker pool for {CellKey} now has {WorkerCount} workers.", _cellKey, _workers.Count);

    Become(Ready);
  }

  void Ready()
  {
    Receive<Resize>(resize =>
    {
      Log.Debug("Pool resizing has been requested ({CurrentSize} -> {NewSize}).", _poolSize, resize.NewSize);

      if (resize.NewSize > _poolSize)
      {
        Log.Info("Pool is expanding from {CurrentWorkerCount} workers to {NewWorkerCount}.", _poolSize, resize.NewSize);

        for (int workerId = _poolSize; workerId < resize.NewSize; workerId++)
          StartWorker($"worker-{workerId}");
      }
      else if (resize.NewSize < _poolSize)
      {
        Log.Info("Pool is shrinking from {CurrentWorkerCount} workers to {NewWorkerCount}.", _poolSize, resize.NewSize);

        // First and last worker to trim from the pool.
        int firstWorkerId = _poolSize - 1;
        int lastWorkerId = resize.NewSize - 1;
        for (int workerId = firstWorkerId; workerId > lastWorkerId; workerId--)
          StopWorker(workerId);
      }
      else
      {
        Log.Debug("No change to pool size is required.");

        return;
      }

      _poolSize = resize.NewSize;
    });
    Receive<Terminated>(terminated =>
    {
      if (!_workers.Remove(terminated.ActorRef))
      {
        Log.Warning("Received termination notice for unknown actor {ActorPath}.", terminated.ActorRef.Path);

        return false;
      }

      Log.Info("Job worker {ActorPath} for {CellKey} was terminated by its supervisor strategy. A replacement worker will now be started.",
        terminated.ActorRef.Path,
        _cellKey
      );

      // Start a new worker to replace the old one.
      StartWorker(terminated.ActorRef.Path.Name);

      return true;
    });
  }

  void StartWorker(string name)
  {
    if (String.IsNullOrWhiteSpace(name))
      throw new ArgumentException("Worker name cannot be null, empty, or entirely composed of whitespace.", nameof(name));

    Log.Debug("Starting job worker {ActorName} in pool for {CellKey}...", name, _cellKey);

    IActorRef worker = Context.ActorOf(_workerProps, name);
    Context.Watch(worker);

    _workers.Add(worker);

    Log.Debug("Started job worker {ActorName} in pool for {CellKey}.", name, _cellKey);
  }

 void StopWorker(int workerId)
  {
    if (workerId < 0 || workerId >= _workers.Count)
      throw new ArgumentOutOfRangeException(nameof(workerId), workerId, "Invalid worker Id.");

    IActorRef worker = _workers[workerId];
    _workers.RemoveAt(workerId);

    Log.Debug("Gracefully stopping job worker {WorkerPath} in pool for {CellKey}...", worker.Path, _cellKey);
    worker.Tell(
      JobWorker.GracefulStop.Instance // Don't ask for any more jobs.
    );
    Context.Unwatch(worker);
  }

  public sealed class Resize
    : MessageBase
  {
    public Resize(int newSize)
    {
      if (newSize < 1)
        throw new ArgumentOutOfRangeException(nameof(newSize), newSize, "Invalid");

      NewSize = newSize;
    }

    public int NewSize { get; }
  }
}
```

The worker (again, code has been simplified for the purposes of demonstration):
```csharp
public sealed class JobWorker
  : ReceiveActorEx
{
  readonly CellKey    _cellKey;

  readonly IActorRef  _dispatcher;

  bool                _isStopping;

  public JobWorker(CellKey cellKey, IActorRef dispatcher)
  {
    if (dispatcher == null)
      throw new ArgumentNullException(nameof(dispatcher));

    _cellKey = cellKey;
    _dispatcher = dispatcher;
  }

  protected override void PreStart()
  {
    base.PreStart();

    Become(WaitingForJob);
  }

  void WaitingForJob()
  {
    HandleGracefulStop();

    if (_isStopping)
    {
      Log.Debug("Worker will stop now.");

      Context.Stop(Self);

      return;
    }

    _dispatcher.Tell(
      new ReadyForJob(Self, _cellKey)
    );

    Log.Debug("Worker is ready to process jobs and has requested a job from the dispatcher.");

    ReceiveActivity<EntityProvisioningJob>(provisioningJob =>
    {
      _currentJob = provisioningJob;
      _currentServiceType = _currentJob.ServiceTypes.First();

      Become(CallProviderApi);
    });
  }

  void CallProviderApi()
  {
    HandleGracefulStop();

    IActorRef providerClient = _providerClients[_currentServiceType];

    Log.Debug("Calling the provider API for service {ServiceType} (using client {ProviderClientPath})...", _currentServiceType, providerClient.Path);

    _dispatcher.Tell(
      new JobWorkStarted(Self, _currentJob, _currentServiceType)
    );

    // Run job.
    providerClient.Tell(new RequestEntityProvisioning(
      _currentJob.JobId,
      _currentJob.Action,
      DefaultProviderTimeout,
      _currentServiceType,
      _currentJob.EntityId,
      _currentJob.EntityType,
      _currentJob.EntitySubType
    ));

    ReceiveActivity<EntityProvisioningComplete>(provisioningComplete =>
    {
      if (provisioningComplete.Result == ProvisioningResult.Success)
      {
        Log.Info("Provider for service type {ServiceType} indicates that it successfully performed job {JobId}.", provisioningComplete.ServiceType, provisioningComplete.JobId, provisioningComplete.ProvisioningErrorCode);

        _dispatcher.Tell(new JobWorkCompleted(
          worker: Self,
          job: _currentJob.Succeeded(provisioningComplete.UpdatePropertyJson, provisioningComplete.Messages)
        ));
      }
      else
      {
        Log.Warning("Provider for service type {ServiceType} indicates that it failed to successfully perform job {JobId} (error code {ErrorCode}).", provisioningComplete.ServiceType, provisioningComplete.JobId, provisioningComplete.ProvisioningErrorCode);

        _dispatcher.Tell(new JobWorkCompleted(
          worker: Self,
          job: _currentJob.Failed(provisioningComplete.ProvisioningErrorCode, provisioningComplete.UpdatePropertyJson, provisioningComplete.Messages)
        ));
      }

      _currentJob = null;
      _currentServiceType = ServiceType.None;

      Become(WaitingForJob);
    });
    ReceiveActivity<OperationResult.Failure>(providerClientError =>
    {
      IActorRef currentProviderClient;
      if (!_providerClients.TryGetValue(_currentServiceType, out currentProviderClient) || !Sender.Equals(currentProviderClient))
        return false;

      Log.Warning("Provider client for service {ServiceType} indicates that it encountered an error while processing job {JobId}.", _currentServiceType, _currentJob.JobId);

      _dispatcher.Tell(new JobWorkCompleted(
        worker: Self,
        job: _currentJob.Failed(
          ProvisioningErrorCode.CommunicationsError,
          _currentJob.ProviderMessages.Add(new ProviderMessage(
            DateTimeOffset.UtcNow,
            String.Format("Error while communicating with the provider API for service {0}. {1}",
              _currentServiceType,
              providerClientError.Cause.SafeToString()
            ),
            ProviderMessageSeverity.Error
          ))
        )
      ));

      _currentJob = null;
      _currentServiceType = ServiceType.None;

      Become(WaitingForJob);

      return true;
    });
    Receive<Terminated>(terminated =>
    {
      // Was our provider client terminated? This can happen if it exceeded the maximum number of retries.
      foreach (ServiceType serviceType in _providerClients.Keys.ToArray())
      {
        IActorRef terminatedProviderClient = _providerClients[serviceType];
        if (terminatedProviderClient.Equals(terminated.ActorRef))
        {
          _providerClients.Remove(serviceType);

          if (serviceType != _currentServiceType)
            return true; // We don't care about this provider right now.

          Log.Warning("Provider client for service type {ServiceType} was terminated; this usually indicates that it exceeded the maximum number of retries while performing job {JobId}.", _currentServiceType, _currentJob.JobId);

          _dispatcher.Tell(new JobWorkCompleted(
            worker: Self,
            job: _currentJob.Failed(
              ProvisioningErrorCode.CommunicationsError,
              ImmutableList.Create(new ProviderMessage(
                DateTimeOffset.UtcNow,
                $"The job was aborted because one or more errors occurred while communicating with the provider API for service '{_currentServiceType}'.",
                ProviderMessageSeverity.Error
              ))
            )
          ));

          _currentJob = null;
          _currentServiceType = ServiceType.None;

          Become(WaitingForJob);

          return true;
        }
      }

      return false; // We only watch our provider clients, so why were we told about this?
    });
  }

  void HandleGracefulStop()
  {
    ReceiveActivity<GracefulStop>(gracefulStop =>
    {
      if (_isStopping)
        return;

      _isStopping = true;

      if (_currentJob == null)
      {
        Log.Debug("Worker will stop now.");

        Context.Stop(Self);
      }
      else
        Log.Debug("Worker will stop once it has finished its current job.");
    });
  }

  public sealed class GracefulStop
    : MessageBase
  {
    public static readonly GracefulStop Instance = new GracefulStop();

    GracefulStop()
    {
    }
  }
}
```
Apologies for removing most of the comments and logging, but I'm trying to fit the code into a relatively small section of this page and want to focus on how we grow / shrink pools. I'll try to get the engine source code made available on GitHub as soon as is practical. For now, if you have any questions, feel free to post them in the comments.
