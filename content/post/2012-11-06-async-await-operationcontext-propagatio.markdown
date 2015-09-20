---
author: tintoy
comments: true
date: 2012-11-06 06:53:24+10:00
layout: post
slug: async-await-operationcontext-propagatio
title: WCF async / await - propagating OperationContext
wordpress_id: 262
categories:
- Code
- Task Parallel Library
- Utility Classes
tags:
- async
- async-await
- tpl
- wcf
---

Unfortunately, Microsoft dropped the ball somewhat when they implemented async / await for WCF.

After the first `await` statement in your `async` service operation, [OperationContext.Current](http://msdn.microsoft.com/en-us/library/system.servicemodel.operationcontext.current.aspx) could be `null` because the rest of the method body may be running on a different thread (and [OperationContext](http://msdn.microsoft.com/en-us/library/system.servicemodel.operationcontext.aspx) does not flow between threads - at least, not without a little help).

Interestingly, this problem can be solved relatively easily if you understand how `async` / `await` works under the covers.

<!--more-->

Without going into too much detail just yet, `async` / `await` uses the [TPL](http://msdn.microsoft.com/en-us/library/dd460717.aspx) (specifically [Task](http://msdn.microsoft.com/en-us/library/system.threading.tasks.task.aspx), which uses [SynchronizationContext](http://msdn.microsoft.com/en-us/library/system.threading.synchronizationcontext.aspx)).

The important thing to understand, here, is that a custom [SynchronizationContext](http://msdn.microsoft.com/en-us/library/system.threading.synchronizationcontext.aspx) implementation allows you to propagate the [OperationContext](http://msdn.microsoft.com/en-us/library/system.servicemodel.operationcontext.aspx) to any new threads that are spawned.

Here's an example of how to use the sample implementation below:

```csharp
/// <summary>
///    Say hello.
/// </summary>
/// <param name="name">
///    Your name.
/// </param>
/// <returns>
///    A greeting.
/// </returns>
public async Task<string> SayHelloAsync(string name)
{
    using (OperationContext.Current.Propagate())
    {
        ChannelFactory<IGreeterWorkflow> workflowChannelFactory = new ChannelFactory<IGreeterWorkflow>("GreeterWorkflow");
        IGreeterWorkflow greeterWorkflowChannel = workflowChannelFactory.CreateChannel();

        Guid instanceId;
        Guid? workflowInstanceId;
        OperationContext clientContext = new OperationContext((IContextChannel)greeterWorkflowChannel);
        using (clientContext.UseAndPropagate())
        {
            instanceId = await greeterWorkflowChannel.IntroduceAsync(name);

            XName workflowInstanceIdHeader = Constants.Header.WorkflowInstanceId;
            workflowInstanceId =
                clientContext
                    .IncomingMessageHeaders
                    .GetHeader<Guid?>(
                        workflowInstanceIdHeader.LocalName,
                        workflowInstanceIdHeader.NamespaceName
                    );
        }
        if (workflowInstanceId != null)
            Debug.WriteLine(workflowInstanceId, "Workflow instance ID from incoming message headers");
        else
            Debug.WriteLine("No workflow instance ID was found in the incoming message headers.");

        OperationContext.Current.SetSessionState("instanceId", instanceId);
        if (workflowInstanceId != null)
            OperationContext.Current.SetSessionState("workflowInstanceId", workflowInstanceId);

        string greeting = await greeterWorkflowChannel.HelloAsync(instanceId);
        ((IClientChannel)greeterWorkflowChannel).Close(); // Close the channel so the host doesn't time out waiting for us.

        return greeting;
    }
}
```

Note the use of the extension methods `Propagate()` and `UseAndPropagate()`.

It's worth noting that it does have a few small issues regarding the disposal of operation-context scopes (since they only allow you to dispose them on the calling thread), but this doesn't seem to be an issue since (at least according to the disassembly), they implement Dispose() but not Finalize().

And the implementation?

~~~csharp
using System;
using System.ServiceModel;
using System.Threading;

namespace TinToy.Utilities.Threading
{
    /// <summary>
    ///    A <see cref="SynchronizationContext"/> implementation that propagates WCF's operation context.
    /// </summary>
    /// <remarks>
    ///    AF: Does not need to be stackable - <see cref="OperationContextScope"/> should take care of scope stacking (except the calling-thread-level scope, which is handled explicitly by <see cref="ContextScope"/>.
    /// </remarks>
    public static class PropagateOperationContext
    {
        #region OperationContext extension methods

        /// <summary>
        ///    Propagate the operation context across thread boundaries (eg. for async / await).
        /// </summary>
        /// <param name="operationContext">
        ///    The operation context to propagate.
        /// </param>
        /// <returns>
        ///    An <see cref="IDisposable"/> implementation that restores the previous synchronisation context when disposed.
        /// </returns>
        /// <remarks>
        ///    Also sets the operation context, as a convenience, for the calling thread.
        ///    This is usually what you want, in async / await scenarios.
        /// </remarks>
        public static IDisposable Propagate(this OperationContext operationContext)
        {
            if (operationContext == null)
                throw new ArgumentNullException("operationContext");

            return
                new ContextScope(
                    new OperationContextPreservingSynchronizationContext(
                        operationContext
                    )
                );
        }

        /// <summary>
        ///    Use the operation context as the current operation context.
        /// </summary>
        /// <param name="operationContext">
        ///    The operation context to use.
        /// </param>
        /// <returns>
        ///    An <see cref="IDisposable"/> implementation that restores the operation context when disposed.
        /// </returns>
        /// <remarks>
        ///    Also sets the operation context, as a convenience, for the calling thread.
        ///    This is usually what you want, in async / await scenarios.
        /// </remarks>
        public static IDisposable Use(this OperationContext operationContext)
        {
            if (operationContext == null)
                throw new ArgumentNullException("operationContext");

            return new OperationContextScope(operationContext);
        }

        /// <summary>
        ///    Use the operation context as the current operation context, and propagate it across thread boundaries (eg. for async / await).
        /// </summary>
        /// <param name="operationContext">
        ///    The operation context to use / propagate.
        /// </param>
        /// <returns>
        ///    An <see cref="IDisposable"/> implementation that restores the previous synchronisation and operation contexts when disposed.
        /// </returns>
        public static IDisposable UseAndPropagate(this OperationContext operationContext)
        {
            if (operationContext == null)
                throw new ArgumentNullException("operationContext");

            return
                new ContextScope(
                    new OperationContextPreservingSynchronizationContext(
                        operationContext
                    ),
                    operationContext
                );
        }

        #endregion // OperationContext extension methods

        #region Custom synchronisation context

        /// <summary>
        ///    A custom synchronisation context that propagates the operation context across threads.
        /// </summary>
        [System.Diagnostics.CodeAnalysis.SuppressMessage("Microsoft.Design", "CA1001:TypesThatOwnDisposableFieldsShouldBeDisposable", Justification = "We don't actually want to dispose the operation context scope because it may wind up being disposed on a different thread than the one that created it.")]
        class OperationContextPreservingSynchronizationContext
            : SynchronizationContext
        {
            #region Instance data

            /// <summary>
            ///    The operation context to propagate.
            /// </summary>
            readonly OperationContext        _operationContext;

            /// <summary>
            ///    Object used for locking the live scope.
            /// </summary>
            readonly object                    _scopeLock = new object();

            /// <summary>
            ///    Our live operation context scope.
            /// </summary>
            OperationContextScope            _operationContextScope;

            #endregion // Instance data

            #region Construction

            /// <summary>
            ///    Create a new operation-context-preserving synchronization context.
            /// </summary>
            /// <param name="operationContext">
            ///    The operation context to propagate.
            /// </param>
            public OperationContextPreservingSynchronizationContext(OperationContext operationContext)
            {
                if (operationContext == null)
                    throw new ArgumentNullException("operationContext");

                _operationContext = operationContext;
            }

            #endregion // Construction

            #region SynchronizationContext overrides

            /// <summary>
            ///    Create a copy of the synchronisation context.
            /// </summary>
            /// <returns>
            ///    The new synchronisation context.
            /// </returns>
            public override SynchronizationContext CreateCopy()
            {
                return new OperationContextPreservingSynchronizationContext(_operationContext);
            }

            /// <summary>
            ///    Dispatch a synchronous message to the synchronization context.
            /// </summary>
            /// <param name="callback">
            ///    The <see cref="SendOrPostCallback"/> delegate to call.
            /// </param>
            /// <param name="state">
            ///    The state object passed to the delegate.
            /// </param>
            /// <exception cref="NotSupportedException">
            ///    The method was called in a Windows Store app. The implementation of <see cref="SynchronizationContext"/> for Windows Store apps does not support the <see cref="SynchronizationContext.Send"/> method.
            /// </exception>
            public override void Send(SendOrPostCallback callback, object state)
            {
                base.Send(
                    chainedState =>
                        CallWithOperationContext(callback, state),
                    state
                );
            }

            /// <summary>
            ///    Dispatch an asynchronous message to the synchronization context.
            /// </summary>
            /// <param name="callback">
            ///    The <see cref="SendOrPostCallback"/> delegate to call in the synchronisation context.
            /// </param>
            /// <param name="state">
            ///    The state object passed to the delegate.
            /// </param>
            public override void Post(SendOrPostCallback callback, object state)
            {
                base.Post(
                    chainedState =>
                        CallWithOperationContext(callback, state),
                    state
                );
            }

            #endregion // SynchronizationContext overrides

            #region Helper methods

            /// <summary>
            ///    Push a new operation context scope onto the scope stack, if required.
            /// </summary>
            /// <remarks>
            ///    <c>true</c>, if a new operation context scope was created, otherwise, <c>false</c>.
            /// </remarks>
            bool PushOperationContextScopeIfRequired()
            {
                if (OperationContext.Current != _operationContext)
                {
                    lock (_scopeLock)
                    {
                        ReleaseOperationContextScopeIfRequired();
                        _operationContextScope = new OperationContextScope(_operationContext);
                    }

                    return true;
                }

                return false;
            }

            /// <summary>
            ///    Release the current operation context scope generated by the synchronisation context (if it exists).
            /// </summary>
            void ReleaseOperationContextScopeIfRequired()
            {
                if (_operationContextScope == null)
                {
                    lock (_scopeLock)
                    {
                        if (_operationContextScope != null)
                        {
                            _operationContextScope.Dispose();
                            _operationContextScope = null;
                        }
                    }
                }
            }

            /// <summary>
            ///    Call a callback delegate with a the operation context set.
            /// </summary>
            /// <param name="chainedCallback">
            ///    The chained delegate to call.
            /// </param>
            /// <param name="chainedState">
            ///    The callback state, if any.
            /// </param>
            void CallWithOperationContext(SendOrPostCallback chainedCallback, object chainedState)
            {
                if (chainedCallback == null)
                    throw new ArgumentNullException("chainedCallback");

                bool pushedNewScope = PushOperationContextScopeIfRequired();
                try
                {
                    chainedCallback(chainedState);
                }
                finally
                {
                    if (pushedNewScope)
                        ReleaseOperationContextScopeIfRequired();
                }
            }

            #endregion // Helper methods
        }

        #endregion // Custom synchronisation context

        #region Custom scope

        /// <summary>
        ///    Set a new sycnronisation context; restore the old one when disposed.
        /// </summary>
        class ContextScope
            : IDisposable
        {
            /// <summary>
            ///    The new synchronisation context.
            /// </summary>
            readonly OperationContextPreservingSynchronizationContext    _newContext;

            /// <summary>
            ///    The old synchronisation context.
            /// </summary>
            readonly SynchronizationContext                                _oldContext;

            /// <summary>
            ///    The operation context scope (if any) that was already set for the calling thread when the scope was created.
            /// </summary>
            readonly OperationContext                                    _preexistingContext;

            /// <summary>
            ///    Have we been disposed?
            /// </summary>
            bool                                                        _disposed;

            /// <summary>
            ///    Create a new context scope.
            /// </summary>
            /// <param name="newContext">
            ///    The new context.
            /// </param>
            /// <param name="setAsCurrentForCallingThread">
            ///    The operation context (if any) to set as the current context for the calling thread.
            ///    If <c>null</c>, no operation context will be set for the calling thread.
            /// </param>
            [System.Diagnostics.CodeAnalysis.SuppressMessage("Microsoft.Reliability", "CA2000:Dispose objects before losing scope", Justification = "We don't dispose the context; it will be replaced when another context is created.")]
            public ContextScope(OperationContextPreservingSynchronizationContext newContext, OperationContext setAsCurrentForCallingThread = null)
            {
                if (newContext == null)
                    throw new ArgumentNullException("newContext");

                _newContext = newContext;
                _oldContext = SynchronizationContext.Current;
                SynchronizationContext.SetSynchronizationContext(_newContext);

                if (setAsCurrentForCallingThread != null)
                {
                    // Save it so we can restore it when we're disposed.
                    _preexistingContext = OperationContext.Current;

// ReSharper disable ObjectCreationAsStatement

                    // Set-and-forget.
                    new OperationContextScope(setAsCurrentForCallingThread);

// ReSharper restore ObjectCreationAsStatement
                }
            }

            /// <summary>
            ///    Release the scope.
            /// </summary>
            /// <remarks>
            ///    We don't dispose the calling thread's synchronisation scope; we expect that it would already have gone out of scope due to async / await state machine behaviour.
            /// </remarks>
            [System.Diagnostics.CodeAnalysis.SuppressMessage("Microsoft.Reliability", "CA2000:Dispose objects before losing scope", Justification = "We don't dispose the context; it will be replaced when another context is created.")]
            public void Dispose()
            {
                if (!_disposed)
                {
                    _disposed = true; // Whatever happens, don't attempt this more than once.

                    SynchronizationContext.SetSynchronizationContext(_oldContext);

// ReSharper disable ObjectCreationAsStatement

                    // Restore the existing operation context, if one was present when the scope was created.
                    if (_preexistingContext != null)
                        new OperationContextScope(_preexistingContext);

// ReSharper restore ObjectCreationAsStatement

                    GC.SuppressFinalize(this);
                }
            }
        }

        #endregion // Custom scope
    }
}
~~~
