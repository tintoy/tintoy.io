---
layout: post
title: Kubernetes-native applications with .NET Core
author: tintoy
comments: true
slug: kubernetes-native-applications-with-netcore
categories:
  - .NET Core
  - ASP.NET Core
  - Kubernetes
---

.NET Core was designed from the ground up as a cloud-native platform for building applications.

Traditionally, containerised applications get their configuration from environment variables. But since containers (including their environment variables) are effectively immutable, changing the configuration requires that the container is re-created.

For static configuration, this is fine, but for dynamic configuration you're better off using something like [Consul K/V](https://www.consul.io/api/kv.html) or a database for your configuration data.

But you're hosting your application in Kubernetes, you now have an additional option :-)
<!-- more -->

## Kubernetes configuration resources

Kubernetes provides 2 primitives for configuring applications:

* `ConfigMap`
* `Secret`

### ConfigMap

A ConfigMap is a key / value store for application settings. It can contain any data you like (but is more suited to textual data).

### Secret

Secrets are similar to ConfigMaps, but their data is Base64-encoded; if you want to store a certificate or binary key material then Secrets have got you covered (their contents can be mounted as volumes).

## Microsoft.Extensions.Configuration

.NET Core (ASP.NET Core, more specifically) provides an abstraction for application configuration in the form of `Microsoft.Extensions.Configuration` (and `Microsoft.Extensions.Options` on top of that).

Out of the box, you already ave providers that support sourcing configuration from JSON files, environment variables, command-line arguments, etc. For some configuration sources, it will even automatically reload the configuration if the source data changes.

## KubeClient.Extensions.Configuration

As part of my new `KubeClient` library, there are now configuration providers that use a Kubernetes `ConfigMap` or `Secret` as the source for configuration data. If the `ConfigMap` or `Secret` is modified after the application is started, the application configuration will be automatically updated.

## An example ConfigMap

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

## Using the ConfigMap for configuration

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
    Console.WriteLine("\t'{0}' = '{1}'", item.Key, item.Value);
```

## Automatically reloading

You can also enable automatic reloading of the configuration when the underlying ConfigMap changes:

```csharp
// TODO: Add example code.
```
