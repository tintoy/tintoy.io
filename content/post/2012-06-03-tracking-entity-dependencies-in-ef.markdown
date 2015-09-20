---
author: tintoy
comments: true
date: 2012-06-03 00:52:36+10:00
layout: post
slug: tracking-entity-dependencies-in-ef
title: Tracking entity dependencies in the Entity Framework
wordpress_id: 157
---

Recently, I've been thinking about ways of tracking dependencies in the [Entity Framework](http://msdn.microsoft.com/en-us/data/ef.aspx).
<!--more-->


## Problem scope


The problem I set out to solve specifically revolves around scenarios where [EF Code First](http://blogs.msdn.com/b/adonet/archive/2011/09/28/ef-4-2-code-first-walkthrough.aspx) techniques are employed. This has a couple of implications, the most important of which are the assumptions that:




  * All relationships have navigation properties on the dependent end of the relationship


  * The model is configured using a [ModelBuilder ](http://msdn.microsoft.com/en-us/library/microsoft.data.schema.schemamodel.modelbuilder.aspx)in [OnModelCreating](http://msdn.microsoft.com/en-us/library/system.data.entity.dbcontext.onmodelcreating(v=vs.103).aspx)




## Terminology


For the purposes of this post, "B depends on A" means that B has a relationship to A of multiplicity (0..n - 1).
In other words, each A can be related to 0 or more Bs, but each and every B must be related to exactly 1 A. If an A is deleted, then that delete must be cascaded to any Bs that relate to it (or the deletion of the A must be disallowed).


## Metadata


One of the good things about EF is that it keeps track of entity metadata, so that you can examine your entity model at runtime to discover the relationships between various types of entities. Specifically, the [metadata workspace](http://msdn.microsoft.com/en-us/library/bb399600(v=vs.90).aspx) is accessible from the [entity context](http://msdn.microsoft.com/en-us/library/system.data.entity.dbcontext(v=vs.103).aspx)'s underlying [object context](http://msdn.microsoft.com/en-us/library/system.data.objects.objectcontext(v=vs.103).aspx) via [IObjectContextAdapter](http://msdn.microsoft.com/en-us/library/gg696353(v=vs.103)).

The easiest way to find navigation properties is:
```csharp
ObjectContext objectContext = ((IObjectContextAdapter)dbContext).ObjectContext;
EntityContainer defaultEntityContainer =
    objectContext
        .MetadataWorkspace
        .GetEntityContainer(objectContext.DefaultContainerName, DataSpace.CSpace);
IEnumerable<NavigationProperty> navigationProperties =
    defaultEntityContainer
        .BaseEntitySets
        .SelectMany(
            entitySet =>
                entitySet
                    .ElementType
                    .Members
                    .OfType<NavigationProperty>()
        );
```

If we now want to find all navigation properties that link to a particular entity type, we can simply use:
```csharp
string entityTypeName = typeof(MyEntity).FullName;
IEnumerable<NavigationProperty> navigationPropertiesLinkingToMyEntity =
    navigationProperties
        .Where(
            property =>
                // The "To" end of the relationship links to our desired entity type.
                property.ToEndMember.GetEntityType().FullName == entityTypeName
                &&
                (
                    // The "To" end of the relationship is mandatory (lower multiplicity bound of 1).
                    navProperty.ToEndMember.RelationshipMultiplicity == RelationshipMultiplicity.One

                    ||

                    // The "To" end of the relationship mandates delete cascade or delete restriction.
                    navProperty.ToEndMember.DeleteBehavior != OperationAction.None
                )
        );
```
This gives us a list of entity types and their associated navigation properties that link to a required instance of our dependee entity type.
In other words, we now have a list of all entity types that can depend on our entity type, and the means to navigate the relationship between them.

We can now turn this list of navigation properties into a series of [Types](http://msdn.microsoft.com/en-us/library/system.type.aspx), [PropertyInfos](http://msdn.microsoft.com/en-us/library/system.reflection.propertyinfo.aspx), and [LamdbaExpressions](http://msdn.microsoft.com/en-us/library/system.linq.expressions.lambdaexpression.aspx) for obtaining and comparing entities and key values. I'll talk more about this in my next post.



## Alternatives


I should probably point out that you don't have to use LINQ or dynamic LINQ predicate expressions to navigate relationships (and, in fact, you cannot use this technique to navigate relationships for which no actual navigation properties exist). You can just (about) as easily navigate the relationships using non-generic methods on the DbContext such as [Set()](http://msdn.microsoft.com/en-us/library/gg679544(v=vs.103).aspx), [Entry()](http://msdn.microsoft.com/en-us/library/gg696238(v=vs.103).aspx) and [Collection()](http://msdn.microsoft.com/en-us/library/system.data.entity.infrastructure.dbentityentry.collection(v=vs.103).aspx).

Since, however, I am targeting EF Code First, I assume that all relationships have navigation properties (and it does allow us to provide an API which encourages consumers to use it "the EF Code First way").

In the next post, I will discuss techniques for dynamically querying EF for dependencies of a given entity.
