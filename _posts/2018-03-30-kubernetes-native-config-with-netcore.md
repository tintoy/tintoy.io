---
layout: post
title: Kubernetes-native configuration with .NET Core
author: tintoy
comments: true
slug: kubernetes-native-config-with-netcore
categories:
  - Kubernetes
  - .NET Core
  - ASP.NET Core
---

Traditionally, containerised applications have gotten their configuration from environment variables or configuration files mounted into the container. But since containers (including their environment variables and mounts) are effectively immutable, changing the configuration requires that the container is re-created.

For static configuration, this is fine, but for dynamic configuration you're better off using something like [Consul K/V](https://www.consul.io/api/kv.html) or a database for your configuration data.

And if you're hosting your application in Kubernetes, you now have an additional option :-)
<!-- more -->

### Kubernetes configuration resources

Kubernetes provides 2 primary mechanisms for configuring applications:

* ConfigMaps
* Secrets

#### ConfigMap

A [ConfigMap](https://kubernetes.io/docs/tasks/configure-pod-container/configure-pod-configmap/) is a key / value store for application settings. It can contain any data you like (but is more suited to textual data).

#### Secret

A [Secret](https://kubernetes.io/docs/concepts/configuration/secret/) is similar to a `ConfigMap`, but its data is Base64-encoded; if you want to store a certificate or other non-textual key material then Secrets have got you covered.

### Supplying app configuration

The key / value pairs that comprise ConfigMaps and Secrets are most commonly used to populate either environment variables or the content of files mounted into containers.

For example, here's a ConfigMap and a partial `Pod` specification that propagates its keys / values to the pod's container as environment variables.

```yaml
---
kind: ConfigMap
apiVersion: v1
metadata:
  name: demo-config
  namespace: default
data:
  key1: 'Hello, World'
  key2: 'Goodbye, Moon'
---
kind: Pod
apiVersion: v1
metadata:
  name: demo-pod
  namespace: default
spec:
  containers:
    - name: container1
      env:
        - name: GREETING
          valueFrom:
            configMapKeyRef:
              name: demo-config
              key: key1
        - name: FAREWELL
          valueFrom:
            configMapKeyRef:
              name: demo-config
              key: key2
```

And here's an example of mounting a Secret's keys / values as files in a container:

```yaml
---
apiVersion: v1
kind: Secret
metadata:
  name: demo-secret
type: Opaque
data:
  certificate.pem: YWRtaW4=
  private.key: MWYyZDFlMmU2N2Rm
---
kind: Pod
apiVersion: v1
metadata:
  name: demo-pod
  namespace: default
spec:
  containers:
    - name: container1
      volumeMounts:
        - name: ssl
          mountPath: /etc/ssl
  volumes:
    - name: ssl
      secret:
        secretName: demo-config
```

### Microsoft.Extensions.Configuration

.NET Core (ASP.NET Core, more specifically) provides an abstraction for application configuration in the form of `Microsoft.Extensions.Configuration` (and `Microsoft.Extensions.Options` on top of that).

Out of the box, you already have providers that support sourcing configuration from JSON files, environment variables, command-line arguments, etc. For some configuration sources, it will even automatically reload the configuration if the source data changes.

### KubeClient.Extensions.Configuration

The [KubeClient](https://github.com/tintoy/dotnet-kube-client/) library supports configuration providers that use a Kubernetes `ConfigMap` or `Secret` as the source for configuration data. Optionally, if the `ConfigMap` or `Secret` is modified after the application is started then the application configuration will be automatically updated.

#### Using a ConfigMap for configuration

```csharp
KubeClientOptions kubeClientOptions = Config.Load().ToKubeClientOptions();

IConfiguration configuration = new ConfigurationBuilder()
    .AddKubeConfigMap(kubeClientOptions,
        configMapName: "config-from-configmap",
        kubeNamespace: "default"
    )
    .Build();

string greeting = configuration["key1"];
Console.WriteLine("Greeting: {0}", greeting);

string farewell = configuration["key2"];
Console.WriteLine("Farewell: {0}", farewell);
```

#### Automatically reloading

You can also enable automatic reloading of the configuration when the underlying ConfigMap changes:

```csharp
KubeClientOptions kubeClientOptions = Config.Load().ToKubeClientOptions();

IConfiguration configuration = new ConfigurationBuilder()
    .AddKubeConfigMap(kubeClientOptions,
        configMapName: "config-from-configmap",
        kubeNamespace: "default",
        reloadOnChange: true
    )
    .Build();

// We want to be notified each time the configuration changes.
var reloadToken = configuration.GetReloadToken();
reloadToken.RegisterChangeCallback(OnConfigChanged, state: null);

void OnConfigChanged(object state)
{
    string greeting = configuration["key1"];
    Console.WriteLine("Updated greeting: {0}", greeting);

    string farewell = configuration["key2"];
    Console.WriteLine("Updated farewell: {0}", farewell);

    // Reload tokens only work once, then you need a new one.
    reloadToken = configuration.GetReloadToken();
    reloadToken.RegisterChangeCallback(OnConfigChanged, state: null);
}
```

### IOptions\<T\>

Once you have your configuration (e.g. in an ASP.NET Core `Startup` class), you can configure the dependency-injection system to make typed options available to represent it.

So if you define an options class:

```csharp
public class MyAppOptions
{
    public string Greeting { get; set; }
    public string Farewell { get; set; }
}
```

Then configure your configuration providers:

```csharp
WebHost.CreateDefaultBuilder(args)
    .ConfigureAppConfiguration(
        configuration => configuration.AddKubeConfigMap(
            clientOptions: KubeClientOptions.FromPodServiceAccount(),
            configMapName: "demo-config",
            kubeNamespace: "default",
            reloadOnChange: true
        )
    )
    .UseStartup<Startup>()
```

Then configure your service container:

```csharp
public class Startup
{
    public Startup(IConfiguration configuration)
    {
        Configuration = configuration;
    }

    public IConfiguration Configuration { get; }

    // This method gets called by the runtime. Use this method to add services to the container.
    public void ConfigureServices(IServiceCollection services)
    {
        services.AddOptions();
        services.Configure<MyAppOptions>(Configuration);
    }
}
```

Finally, inject the options into a controller:

```csharp
[Route("api/v1/greetings")]
public class GreetingController
{
    public GreetingController(IOptions<MyAppOptions> options)
    {
        Options = options.Value;
    }

    MyAppOptions Options { get; }

    [HttpGet("hello-goodbye")]
    public IActionResult HelloGoodbye()
    {
        return Ok(new
        {
            Greeting = Options.Greeting,
            Farewell = Options.Farewell
        });
    }
}
```

If you call this web API before and after changing the ConfigMap, you will see that the application options change automatically.
