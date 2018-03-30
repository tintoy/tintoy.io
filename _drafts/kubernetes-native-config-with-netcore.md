---
layout: post
title: Kubernetes-native configuration with .NET Core
author: tintoy
comments: true
slug: kubernetes-native-config-with-netcore
categories:
  - .NET Core
  - ASP.NET Core
  - Kubernetes
---

.NET Core was designed from the ground up as a cloud-native platform for building applications.

Traditionally, containerised applications have gotten their configuration from environment variables. But since containers (including their environment variables) are effectively immutable, changing the configuration requires that the container is re-created.

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

A [Secret](https://kubernetes.io/docs/concepts/configuration/secret/) is similar to a `ConfigMap`, but its data is Base64-encoded; if you want to store a certificate or binary key material then Secrets have got you covered (their contents can also be mounted into containers as files).

### Microsoft.Extensions.Configuration

.NET Core (ASP.NET Core, more specifically) provides an abstraction for application configuration in the form of `Microsoft.Extensions.Configuration` (and `Microsoft.Extensions.Options` on top of that).

Out of the box, you already have providers that support sourcing configuration from JSON files, environment variables, command-line arguments, etc. For some configuration sources, it will even automatically reload the configuration if the source data changes.

### KubeClient.Extensions.Configuration

As part of my new `KubeClient` library, there are now configuration providers that use a Kubernetes `ConfigMap` or `Secret` as the source for configuration data. If the `ConfigMap` or `Secret` is modified after the application is started, the application configuration will be automatically updated.

#### An example ConfigMap

```yaml
kind: ConfigMap
apiVersion: v1
metadata:
  name: config-from-configmap
  namespace: default
data:
  Key1: One
  Key2: Two
```

#### Using the ConfigMap for configuration

```csharp
KubeClientOptions kubeClientOptions = Config.Load().ToKubeClientOptions();

IConfiguration configuration = new ConfigurationBuilder()
    .AddKubeConfigMap(kubeClientOptions,
        configMapName: "config-from-configmap",
        kubeNamespace: "default"
    )
    .Build();

Console.WriteLine("Got configuration:");
foreach (var item in configuration.AsEnumerable())
{
    Console.WriteLine("\t'{0}' = '{1}'",
      item.Key,
      item.Value
    );
}
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
    Console.WriteLine("Got changed configuration:");
    foreach (var item in configuration.AsEnumerable())
    {
        Console.WriteLine("\t'{0}' = '{1}'",
          item.Key,
          item.Value
        );
    }

    // Reload tokens only work once, then you need a new one.
    reloadToken = configuration.GetReloadToken();
    reloadToken.RegisterChangeCallback(OnConfigChanged, state: null);
}
```

### Putting it all together

Let's create a new ASP.NET Core application:

```bash
dotnet new mvc -o ./KConfigWebApp -f netcoreapp2.0
cd ./KConfigWebApp
```

**TODO: Document process for creating sample**
