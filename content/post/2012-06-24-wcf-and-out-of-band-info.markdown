---
author: tintoy
comments: true
date: 2012-06-24 02:45:04+10:00
layout: post
slug: wcf-and-out-of-band-info
title: WCF and transparent flow of out-of-band information
wordpress_id: 209
categories:
- Code
- Utility Classes
- WCF
---

Out-of-band information includes things like security, session state, and transaction flow. Recently, I've been thinking about various ways of transparently transferring it between a client and a service. This out-of-band data that can be transparently transferred as a logical execution path crosses AppDomain, process, and machine boundaries can be collectively thought of as the logical call context. This is similar to [Remoting](http://msdn.microsoft.com/en-us/library/kwdt6w2k%28v=vs.100%29.aspx)'s [CallContext](http://msdn.microsoft.com/en-us/library/530yxxh3.aspx).

<!-- more -->



## Here be dragons


I reckon that one of the main reasons Remoting failed was because its design encouraged its users to treat the transport layer as being totally transparent; effectively, to pretend that it didn't exist. This is obviously a load of horseshit; the network is not, and will probably never be, completely transparent. Latency, unreliable connections, differences in platform - they all mean that pretending that remote objects are just like local ones almost always leads to fragility and crap performance.

This stuff still adds overhead; you're adding extra bytes and CPU cycles to every request / response sent, so don't go overboard.



## Extensibility


WCF provides [many extensibility points](http://msdn.microsoft.com/en-us/library/ms789051.aspx) which, when used correctly, enable you to customise pretty much any aspect of client / server communication and invocation.

Typically, WCF represents out-of-bad information as [message](http://msdn.microsoft.com/en-us/library/aa347789.aspx) [headers](http://msdn.microsoft.com/en-us/library/system.servicemodel.channels.message.headers.aspx). These are easy to generate and retrieve using [message inspectors](http://msdn.microsoft.com/en-us/library/aa717047.aspx). Typically, these are combined with [call-context initialisers](http://msdn.microsoft.com/en-us/library/system.servicemodel.dispatcher.icallcontextinitializer.aspx) to configure and then clean up any local context for use by the invoked operation.There are other, more elaborate mechanisms for transferring out-of-band data, up to and including complex message exchanges that the calling code never needs to know about (such as establishing security context via WS-SecureConversation, for example), but we'll ignore those, for now.

Use of thread-local storage mechanisms to provide singleton-per-thread objects allows us to define scoped contextual data (much like the [ambient transaction](http://msdn.microsoft.com/en-us/library/system.transactions.transaction.current.aspx) in System.Transactions or [HttpContext.Current](http://msdn.microsoft.com/en-us/library/system.web.httpcontext.current.aspx)) which can be accessed and transferred by the message inspectors and call context initialisers. You can also store your context as an [extension](http://msdn.microsoft.com/en-us/library/ms586703.aspx) of the WCF [OperationContext](http://msdn.microsoft.com/en-us/library/system.servicemodel.operationcontext.aspx), if you prefer.

The customisation of the service description (WSDL) via export extensions to specify the custom headers is fairly simple, but there is a bit of a gotcha: the documentation fails to explain that operation behaviors which also implement [IWsdlExportExtension](http://msdn.microsoft.com/en-us/library/system.servicemodel.description.iwsdlexportextension.aspx) can't directly contribute custom headers by simply modifying the contract definition:



<blockquote>If you want to have an operation-level behaviour that results in custom headers, you will need to also apply a contract-level behaviour that implements IWsdlExportExtension to actually generate the headers (implementing IWsdlExportExtension on the operation-level behaviour does not work)</blockquote>



As an example, consider the following service contract:

```csharp
/// <summary>
///    An obvious example contract interface.
/// </summary>
[TimeOfDaySupport]
[ServiceContract(Name = "ObviousExampleService", Namespace = Constants.Namespace.Contract)]
public interface IObviousExample
{
    /// <summary>
    ///    Add the specfied numbers.
    /// </summary>
    /// <param name="number1">
    ///    The first number.
    /// </param>
    /// <param name="number2">
    ///    The second number.
    /// </param>
    /// <returns>
    ///    The sum of the 2 numbers.
    /// </returns>
    [OperationContract]
    int Add(int number1, int number2);

    /// <summary>
    ///    Generate a greeting.
    /// </summary>
    /// <param name="name">
    ///    The name of the entity to greet.
    /// </param>
    /// <returns>
    ///    The greeting.
    /// </returns>
    [RequiresTimeOfDay]
    [OperationContract]
    string Greet(string name);
}
```
In this case, I have chosen an arbitrary piece of information (the time of day at the client) and:




  1. Marked the contract as supporting time-of-day flow (transfer)


  2. Marked the Greet operation as requiring time-of-day flow



As a convenience, I have configured the infrastructure behind these 2 attributes so that, if you don't apply the [RequiresTimeOfDay] attribute to any operations, it will be assumed on all operations defined in the contract.

Here are the 2 attribute definitions:

```csharp
/// <summary>
///    Mark a service contract as supporting transparent flow of the time-of-day.
/// </summary>
[AttributeUsage(AttributeTargets.Interface)]
public class TimeOfDaySupportAttribute
    : Attribute, IContractBehavior, IWsdlExportExtension
{
    // Implementation omitted for brevity.
}

/// <summary>
///    Mark an operation contract method as requiring transparent flow of the time-of-day.
/// </summary>
/// <remarks>
///    If this attribute is not applied to any operations, all operations will be enabled for flow of time-of-day.
///    </remarks>
[AttributeUsage(AttributeTargets.Method)]
public class RequiresTimeOfDayAttribute
    : Attribute
{
    // Implementation omitted for brevity.
}
```

As you can see, the second attribute is just a marker; TimeOfDaySupportAttribute is the only extensibility entry point.
You could just as easily, however, implement [IOperationBehavior ](http://msdn.microsoft.com/en-us/library/system.servicemodel.description.ioperationbehavior.aspx)on RequiresTimeOfDayAttribute and inject your call-context initialiser from there.



## Customising WSDL generation


In order to ensure that clients know about our custom header (and that it is required, ie. MustUnderstand), we must ensure that the generated WSDL includes information about it. To this end, we also implement [IWsdlExportExtension](http://msdn.microsoft.com/en-us/library/system.servicemodel.description.iwsdlexportextension.aspx).

```csharp
/// <summary>
///    Modify a contract description and / or its generated WSDL.
/// </summary>
/// <param name="exporter">
///    The <see cref="WsdlExporter"/> that exports the contract information.
/// </param>
/// <param name="context">
///    Provides mappings from exported WSDL elements to the contract description.
/// </param>
void IWsdlExportExtension.ExportContract(WsdlExporter exporter, WsdlContractConversionContext context)
{
    IEnumerable<OperationDescription> targetOperations = context.Contract.GetTargetOperationsForAttribute<RequiresTimeOfDayAttribute>();
    if (!targetOperations.Any())
        targetOperations = context.Contract.Operations; // No operations were explicitly marked for transparent flow of time-of-day, so enable it for all of them.

    foreach (OperationDescription operation in targetOperations)
        operation.AddHeader<TimeOfDayHeaderData>(Constants.Name.Header.TimeOfDay);
}
```
GetTargetOperationsForAttribute<TAttribute> and AddHeader<THeader> are both extension methods:
```csharp
/// <summary>
///    Get the target operations for the specified attribute.
/// </summary>
/// <param name="contract">
///    The contract type.
/// </param>
/// <returns>
///    The target operations.
/// </returns>
/// <typeparam name="TAttribute">
///    The attribute type.
/// </typeparam>
/// <remarks>
///    This method assumes that, if the attribute is applied at the contract level, that it applies to all operations.
/// </remarks>
public static IEnumerable<OperationDescription> GetTargetOperationsForAttribute<TAttribute>(this ContractDescription contract)
    where TAttribute : Attribute
{
    if (contract == null)
        throw new ArgumentNullException("contract");

    Type attributeType = typeof(TAttribute);
    AttributeTargets validOn = AttributeHelpers.GetAttributeTargets<TAttribute>();
    if (!(validOn.HasFlag(AttributeTargets.Interface) || validOn.HasFlag(AttributeTargets.Method)))
        throw new InvalidOperationException(String.Format("Custom attribute type '{0}' is valid for neither interfaces nor methods - it must be valid for at least one of them to retrieve matching target operations.", attributeType.FullName));

    if (validOn.HasFlag(AttributeTargets.Interface))
    {
        // Check if the contract has this attribute applied.
        bool appliedToContract = contract.HasCustomAttribute<TAttribute>(true); // Allow for contract inheritance.
        if (appliedToContract)
        {
            // Since the attribute is applied to the contract, we assume that this means it targets all operations.
            foreach (OperationDescription operation in contract.Operations)
                yield return operation;

            yield break;
        }
    }

    if (validOn.HasFlag(AttributeTargets.Method))
    {
        foreach (OperationDescription operation in contract.Operations)
        {
            MethodInfo operationMethod = operation.GetEntryPointMethod();
            Debug.Assert(operationMethod != null, "operationMethod != null");
            bool appliedToMethod = operationMethod.HasCustomAttribute<TAttribute>();
            if (appliedToMethod)
                yield return operation;
        }
    }
}

/// <summary>
///    Determine whether the specified contract's type has a the specified custom attribute.
/// </summary>
/// <param name="contract">
///    The contract description.
/// </param>
/// <param name="inherited">
///    Include attributes inherited from base types?
/// </param>
/// <returns>
///    <c>true</c>, if the attribute is defined on the contract type; otherwise, <c>false</c>.
/// </returns>
/// <typeparam name="TAttribute">
///    The attribute type.
/// </typeparam>
public static bool HasCustomAttribute<TAttribute>(this ContractDescription contract, bool inherited = false)
    where TAttribute : Attribute
{
    if (contract == null)
        throw new ArgumentNullException("contract");

    Type attributeType = typeof(TAttribute);
    AttributeTargets validOn = AttributeHelpers.GetAttributeTargets<TAttribute>();
    if (!validOn.HasFlag(AttributeTargets.Interface))
        throw new InvalidOperationException(String.Format("Custom attribute type '{0}' is not valid for interfaces.", attributeType.FullName));

    return
        contract
            .ContractType
                .HasCustomAttribute<TAttribute>(inherited);
}

/// <summary>
///    Get a custom attribute from the specified operation's method.
/// </summary>
/// <param name="contract">
///    The contract description.
/// </param>
/// <returns>
///    The custom attribute, or <c>null</c> if it is not defined on the contract type.
/// </returns>
/// <typeparam name="TAttribute">
///    The attribute type.
/// </typeparam>
public static TAttribute GetCustomAttribute<TAttribute>(this ContractDescription contract)
    where TAttribute : Attribute
{
    if (contract == null)
        throw new ArgumentNullException("contract");

    Type attributeType = typeof(TAttribute);
    AttributeTargets validOn = AttributeHelpers.GetAttributeTargets<TAttribute>();
    if (!validOn.HasFlag(AttributeTargets.Interface))
        throw new InvalidOperationException(String.Format("Custom attribute type '{0}' is not valid for interfaces.", attributeType.FullName));

    return
        contract
            .ContractType
                .GetCustomAttributes(attributeType, false)
                .Cast<TAttribute>()
                .FirstOrDefault();
}

/// <summary>
///    Determine whether the specified operation's method has a the specified custom attribute.
/// </summary>
/// <param name="operation">
///    The operation description.
/// </param>
/// <param name="fallBackToContract">
///    Check the declaring contract for the attribute, if the operation does not declare it?
///    Defaults to <c>false</c>.
/// </param>
/// <returns>
///    The custom attribute, or <c>null</c> if it is not defined on the operation method / declaring contract type.
/// </returns>
/// <typeparam name="TAttribute">
///    The attribute type.
/// </typeparam>
public static bool HasCustomAttribute<TAttribute>(this OperationDescription operation, bool fallBackToContract = false)
    where TAttribute : Attribute
{
    if (operation == null)
        throw new ArgumentNullException("operation");

    return GetCustomAttribute<TAttribute>(operation, fallBackToContract) != null;
}

/// <summary>
///    Get a custom attribute from the specified operation's method.
/// </summary>
/// <param name="operation">
///    The operation description.
/// </param>
/// <param name="fallBackToContract">
///    Check the declaring contract for the attribute, if the operation does not declare it?
///    Defaults to <c>false</c>.
/// </param>
/// <returns>
///    The custom attribute, or <c>null</c> if it is not defined on the operation method / declaring contract type.
/// </returns>
/// <typeparam name="TAttribute">
///    The attribute type.
/// </typeparam>
public static TAttribute GetCustomAttribute<TAttribute>(this OperationDescription operation, bool fallBackToContract = false)
    where TAttribute : Attribute
{
    if (operation == null)
        throw new ArgumentNullException("operation");

    Type attributeType = typeof(TAttribute);
    AttributeTargets validOn = AttributeHelpers.GetAttributeTargets<TAttribute>();
    if (!(validOn.HasFlag(AttributeTargets.Interface) || validOn.HasFlag(AttributeTargets.Method)))
        throw new InvalidOperationException(String.Format("Custom attribute type '{0}' is valid for neither interfaces nor methods - it must be valid for at least one of them to retrieve matching target operations.", attributeType));

    MethodInfo operationMethod = operation.GetEntryPointMethod();
    Debug.Assert(operationMethod != null, "operationMethod != null");

    TAttribute attribute = operationMethod.GetCustomAttribute<TAttribute>(); // We don't check for for inherited attributes, since you can't have method overrides in interfaces.
    if (attribute != null)
        return attribute;

    // If permitted, fall back to contract.
    if (fallBackToContract && validOn.HasFlag(AttributeTargets.Interface))
    {
        return
            operation
                .DeclaringContract
                .ContractType
                    .GetCustomAttribute<TAttribute>();
    }

    return null;
}

/// <summary>
///    Add the specified header to the operation's request / response messages.
/// </summary>
/// <param name="operation">
///    The operation.
/// </param>
/// <param name="name">
///    The header name.
/// </param>
/// <param name="direction">
///    The direction of the messages on which the header appears.
///    Defaults to input messages only.
/// </param>
/// <param name="isEncoded">
///    Is the header to be encoded?
/// </param>
public static void AddHeader<THeader>(this OperationDescription operation, string name, SoapHeaderDirection direction = SoapHeaderDirection.Input, bool isEncoded = false)
{
    if (operation == null)
        throw new ArgumentNullException("operation");

    if (String.IsNullOrWhiteSpace(name))
        throw new ArgumentException("Argument cannot be null, empty, or composed entirely of whitespace: 'name'.", "name");

    MessageHeaderDescription newHeader = CreateHeader<THeader>(name);
    XmlQualifiedName headerQualifiedName = new XmlQualifiedName(newHeader.Name, newHeader.Namespace);
    foreach (MessageDescription operationMessage in operation.Messages)
    {
        bool messageIsSupportedDirection =
            operationMessage.Direction == MessageDirection.Input && direction.HasFlag(SoapHeaderDirection.Input)
            ||
            operationMessage.Direction == MessageDirection.Output && direction.HasFlag(SoapHeaderDirection.Output);

        if    (messageIsSupportedDirection)
        {
            if (!operationMessage.Headers.Contains(headerQualifiedName))
                operationMessage.Headers.Add(newHeader);
        }
    }
}

/// <summary>
///    Create a header with the specified name and type.
/// </summary>
/// <param name="name">
///    The header name.
/// </param>
/// <returns>
///    A <see cref="MessageHeaderDescription"/> representing the header.
/// </returns>
/// <typeparam name="THeader">
///    The type of value that the header contains.
/// </typeparam>
public static MessageHeaderDescription CreateHeader<THeader>(string name)
{
    if (String.IsNullOrWhiteSpace(name))
        throw new ArgumentException("Argument cannot be null, empty, or composed entirely of whitespace: 'name'.", "name");

    Type headerType = typeof(THeader);
    string headerContractNamespace = headerType.GetDataContractNamespace();
    if (String.IsNullOrWhiteSpace(headerContractNamespace))
        throw new InvalidOperationException(String.Format("Cannot create header for data contract type '{0}' because no namespace has been specified for it.", headerType.FullName));

    return new MessageHeaderDescription(name, headerContractNamespace)
    {
        Type = headerType
    };
}

/// <summary>
///    Get the namespace for the specified data contract type.
/// </summary>
/// <param name="dataContractType">
///    The data contract type.
/// </param>
/// <returns>
///    The namespace, or null if the namespace could not be determined.
/// </returns>
public static string GetDataContractNamespace(this Type dataContractType)
{
    DataContractAttribute dataContractAttribute = dataContractType.GetCustomAttribute<DataContractAttribute>(true);
    if (dataContractAttribute != null)
        return dataContractAttribute.Namespace;

    string clrNamespace = dataContractType.Namespace;

    return
        GetGlobalDataContractNamespace(dataContractType.Module, clrNamespace)
        ??
        GetGlobalDataContractNamespace(dataContractType.Assembly, clrNamespace);
}

/// <summary>
///    Get the assembly- or module-global contract namespace for the given CLR namespace.
/// </summary>
/// <param name="moduleOrAssembly">
///    The module or assembly whose custom attributes are to be examined.
/// </param>
/// <param name="clrNamespace">
///    The CLR namespace.
/// </param>
/// <returns>
///    The global contract namespace, or <c>null</c>, if a global namespace could not be determined for the specified custom attribute provider.
/// </returns>
static string GetGlobalDataContractNamespace(ICustomAttributeProvider moduleOrAssembly, string clrNamespace)
{
    return
        moduleOrAssembly
            .GetCustomAttributes<ContractNamespaceAttribute>()
            .Where(
                attribute =>
                    attribute.ClrNamespace == clrNamespace
            )
            .Select(
                attribute =>
                    attribute.ContractNamespace
            )
            .FirstOrDefault();
}
```

The only other gotchas to look out for in WSDL generation are:




  * The header namespace must be the same as the header value data contract namespace.


  * The header name cannot be the same as any other data contract type (element) name in the service schema.





## The time-of-day scope


The time-of-day scope represents a thread-local scope for time-of-day information. Scopes can be nested, and will transparently flow between client and service.
```csharp
/// <summary>
///    Represents the thread-local scope for a given time of day.
/// </summary>
/// <remarks>
///    <para>
///        For good practice, always create this scope in the context of a using block.
///    </para>
///    <para>
///        This scope uses thread-local storage, so it is always thread-safe.
///    </para>
/// </remarks>
public sealed class TimeOfDayScope
    : IDisposable
{
    #region Instance data

    /// <summary>
    ///    The time of day.
    /// </summary>
    readonly TimeOfDay _timeOfDay;

    /// <summary>
    ///    Custom data (if any) associated with the scope.
    /// </summary>
    readonly string _customData;

    /// <summary>
    ///    As the scope been disposed?
    /// </summary>
    bool _disposed;

    #endregion // Instance data

    #region Construction / Disposal

    /// <summary>
    ///    Create a new time-of-day scope.
    /// </summary>
    /// <param name="timeOfDay">
    ///    The time of day.
    /// </param>
    public TimeOfDayScope(TimeOfDay timeOfDay)
        : this(timeOfDay, null)
    {
    }

    /// <summary>
    ///    Create a new time-of-day scope.
    /// </summary>
    /// <param name="timeOfDay">
    ///    The time of day.
    /// </param>
    /// <param name="customData">
    ///    Custom data (if any) associated with the scope.
    /// </param>
    public TimeOfDayScope(TimeOfDay timeOfDay, string customData)
    {
        _timeOfDay = timeOfDay;
        _customData = customData;

        ScopeStack.Push(this);
    }

    /// <summary>
    ///    Destroy the time-of-day scope.
    /// </summary>
    public void Dispose()
    {
        if (_disposed)
            return;

        if (ScopeStack.Count == 0)
        {
            string errorMessage = String.Format("Scope with hashcode {0} was disposed more than once, or out-of-order (the scope stack is empty).", GetHashCode());
            Debug.WriteLine(errorMessage, "Error");

            throw new InvalidOperationException(errorMessage);
        }

        if (ScopeStack.Peek() != this)
        {
            string errorMessage = String.Format("Scope with hashcode {0} was disposed out-of-order (it should have been on top of the scope stack, but a scope with hashcode {1} was found, instead).", GetHashCode(), ScopeStack.Peek().GetHashCode());
            Debug.WriteLine(errorMessage, "Error");

            throw new InvalidOperationException(errorMessage);
        }

        ScopeStack.Pop();
        _disposed = true;
    }

    #endregion // Construction / Disposal

    #region Public properties

    /// <summary>
    ///    The time of day.
    /// </summary>
    public TimeOfDay TimeOfDay
    {
        get
        {
            return _timeOfDay;
        }
    }

    /// <summary>
    ///    Custom data (if any) associated with the scope.
    /// </summary>
    public string CustomData
    {
        get
        {
            return _customData;
        }
    }

    #endregion // Public properties

    #region Ambient scope

    /// <summary>
    ///    The thread-local stack of scopes.
    /// </summary>
    static readonly ThreadLocal<Stack<TimeOfDayScope>> _scopeStack;

    /// <summary>
    ///    Type initialiser.
    /// </summary>
    static TimeOfDayScope()
    {
        _scopeStack =
            new ThreadLocal<Stack<TimeOfDayScope>>(
                () =>
                    new Stack<TimeOfDayScope>()
            );
    }

    /// <summary>
    ///    Get the scope stack.
    /// </summary>
    static Stack<TimeOfDayScope> ScopeStack
    {
        get
        {
            return _scopeStack.Value;
        }
    }

    /// <summary>
    ///    Does the current thread have an active (current) scope?
    /// </summary>
    public static bool HaveCurrent
    {
        get
        {
            return ScopeStack.Count > 0;
        }
    }

    /// <summary>
    ///    Get the ambient time-of-day scope (if defined) for the current thread.
    /// </summary>
    public static TimeOfDayScope Current
    {
        get
        {
            if (HaveCurrent)
                return ScopeStack.Peek();

            return null;
        }
    }

    #endregion // Ambient scope
}
```



## Transmitting and receiving the header


On the client-side, we hook up  a message inspector is to inject the header whenever a time-of-day scope is active.
On the service-side, we hook up a call-context initialiser to recreate the time-of-day scope based on data in our custom header.
```csharp
/// <summary>
///    Apply the behavior to a client.
/// </summary>
/// <param name="contractDescription">
///    The contract description for which the extension is intended.
///    Use for examination only - if the contract description is modified, the results are undefined.
/// </param>
/// <param name="endpoint">
///    The endpoint.
/// </param>
/// <param name="clientRuntime">
///    The client runtime.
/// </param>
void IContractBehavior.ApplyClientBehavior(ContractDescription contractDescription, ServiceEndpoint endpoint, ClientRuntime clientRuntime)
{
    if (contractDescription == null)
        throw new ArgumentNullException("contractDescription");

    if (endpoint == null)
        throw new ArgumentNullException("endpoint");

    if (clientRuntime == null)
        throw new ArgumentNullException("clientRuntime");

    if (_headerHandler == null)
        _headerHandler = new TimeOfDayHeaderHandler(_customData);

    IEnumerable<OperationDescription> targetOperations = contractDescription.GetTargetOperationsForAttribute<RequiresTimeOfDayAttribute>();
    if (!targetOperations.Any())
        targetOperations = contractDescription.Operations; // If not specified, then apply to all.

    bool installMessageInspector = targetOperations.Any();
    foreach (OperationDescription operation in targetOperations)
    {
        //    Register supported action.
        ClientOperation clientOperation = clientRuntime.Operations[operation.Name];
        _headerHandler.SupportedActions.Add(clientOperation.Action);
    }

    if (installMessageInspector)
    {
        if (!clientRuntime.MessageInspectors.Contains(_headerHandler))
            clientRuntime.MessageInspectors.Add(_headerHandler);
    }
}

/// <summary>
///    Apply the behavior to a contract.
/// </summary>
/// <param name="contractDescription">
///    The contract description to examine.
///    Use for examination only - if the contract description is modified, the results are undefined.
/// </param>
/// <param name="endpoint">
///    The endpoint that exposes the contract.
/// </param>
/// <param name="dispatchRuntime">
///    The dispatch runtime that controls service execution.
/// </param>
void IContractBehavior.ApplyDispatchBehavior(ContractDescription contractDescription, ServiceEndpoint endpoint, DispatchRuntime dispatchRuntime)
{
    if (contractDescription == null)
        throw new ArgumentNullException("contractDescription");

    if (endpoint == null)
        throw new ArgumentNullException("endpoint");

    if (contractDescription == null)
        throw new ArgumentNullException("contractDescription");

    if (_headerHandler == null)
        _headerHandler = new TimeOfDayHeaderHandler(_customData);

    IEnumerable<OperationDescription> targetOperations = contractDescription.GetTargetOperationsForAttribute<RequiresTimeOfDayAttribute>();
    if (!targetOperations.Any())
        targetOperations = contractDescription.Operations; // If not specified, then apply to all.

    foreach (OperationDescription operation in targetOperations)
    {
        DispatchOperation dispatchOperation = dispatchRuntime.Operations[operation.Name];
        if (!dispatchOperation.CallContextInitializers.Contains(_headerHandler))
            dispatchOperation.CallContextInitializers.Add(_headerHandler);

        //    Register supported action.
        _headerHandler.SupportedActions.Add(dispatchOperation.Action);
    }
}
```
The message inspector / call context initialiser is pretty simple:
```csharp
/// <summary>
///    The time-of-day header handler.
/// </summary>
class TimeOfDayHeaderHandler
    : IClientMessageInspector, ICallContextInitializer
{
    /// <summary>
    ///    Supported SOAP actions for messages to handle.
    /// </summary>
    readonly List<string> _supportedActions = new List<string>();

    /// <summary>
    ///    Custom data (if any) to send with each request.
    /// </summary>
    readonly string _customData;

    /// <summary>
    ///    Create a new time-of-day header handler.
    /// </summary>
    public TimeOfDayHeaderHandler()
        : this(null)
    {
    }

    /// <summary>
    ///    Create a new time-of-day header handler.
    /// </summary>
    /// <param name="customData">
    ///    Custom data (if any) to send with each request.
    /// </param>
    public TimeOfDayHeaderHandler(string customData)
    {
        _customData = customData;
    }

    /// <summary>
    ///    Supported SOAP actions for messages to handle.
    /// </summary>
    public List<string> SupportedActions
    {
        get
        {
            return _supportedActions;
        }
    }

    #region IClientMessageInspector implementation

    /// <summary>
    ///    Inspect / modify a message before it is sent to a service.
    /// </summary>
    /// <param name="request">
    ///    The message to be sent to the service.
    /// </param>
    /// <param name="channel">
    ///    The client channel.
    /// </param>
    /// <returns>
    ///    The object that is returned as the correlationState argument of the <see cref="IClientMessageInspector.AfterReceiveReply"/> method.
    ///    This is null if no correlation state is used.
    ///    The best practice is to make this a <see cref="Guid"/> to ensure that no two correlationState objects are the same.
    /// </returns>
    object IClientMessageInspector.BeforeSendRequest(ref Message request, IClientChannel channel)
    {
        if (!_supportedActions.Contains(request.Headers.Action))
            return null; // Nothing to do.

        TimeOfDayScope currentScope = TimeOfDayScope.Current;
        if (currentScope != null)
        {
            MessageHeader<TimeOfDayHeaderData> header = new MessageHeader<TimeOfDayHeaderData>()
            {
                Actor = Constants.Actor.TimeOfDayFlow,
                Content = new TimeOfDayHeaderData
                {
                    TimeOfDay = currentScope.TimeOfDay,
                    CustomData = currentScope.CustomData ?? _customData
                },
                MustUnderstand = true
            };

            request
                .Headers
                .Add(
                    header
                        .GetUntypedHeader(
                            Constants.Name.Header.TimeOfDay,
                            Constants.Namespace.DataContract
                        )
                );
        }

        return null;
    }

    /// <summary>
    ///    Inspect / or modify a message after a reply message is received but prior to passing it back to the client application.
    /// </summary>
    /// <param name="reply">
    ///    The message to be transformed into types and handed back to the client application.
    /// </param>
    ///    <param name="correlationState">
    ///    Correlation state data.
    /// </param>
    void IClientMessageInspector.AfterReceiveReply(ref Message reply, object correlationState)
    {
        // Unused.
    }

    #endregion // IClientMessageInspector implementation

    #region Implementation of ICallContextInitializer

    /// <summary>
    ///    Called before invocation to participate in the initialisation of the call context.
    /// </summary>
    /// <returns>
    ///    A correlation object passed back as the parameter of <see cref="ICallContextInitializer.AfterInvoke"/>.
    /// </returns>
    /// <param name="instanceContext">
    ///    The service instance context for the operation.
    /// </param>
    /// <param name="channel">
    ///    The client channel.
    /// </param>
    /// <param name="message">
    ///    The incoming message.
    /// </param>
    object ICallContextInitializer.BeforeInvoke(InstanceContext instanceContext, IClientChannel channel, Message message)
    {
        if (!_supportedActions.Contains(message.Headers.Action))
            return null; // Nothing to do.

        int headerIndex = message.Headers.FindHeader(Constants.Name.Header.TimeOfDay, Constants.Namespace.DataContract, Constants.Actor.TimeOfDayFlow);
        if (headerIndex != -1)
        {
            // Mark our custom header as understood by the service.
            MessageHeaderInfo header = message.Headers[headerIndex];
            if (!message.Headers.UnderstoodHeaders.Contains(header))
                message.Headers.UnderstoodHeaders.Add(header);
            TimeOfDayHeaderData headerData = message.Headers.GetHeader<TimeOfDayHeaderData>(headerIndex);

            return new TimeOfDayScope(headerData.TimeOfDay, headerData.CustomData); // Automatically goes onto the scope stack.
        }

        return null;
    }

    /// <summary>
    ///    Called after invocation to to participate in call context cleanup.
    /// </summary>
    /// <param name="correlationState">
    ///    The correlation object returned from <see cref="ICallContextInitializer.BeforeInvoke"/>.
    /// </param>
    void ICallContextInitializer.AfterInvoke(object correlationState)
    {
        // Clean up the scope if necessary.
        TimeOfDayScope timeOfDayScope = correlationState as TimeOfDayScope;
        if (timeOfDayScope != null)
            timeOfDayScope.Dispose();
    }

    #endregion
}
```
Note that, because we marked the header as MustUnderstand, we have to mark it as understood or WCF will raise a protocol error.
