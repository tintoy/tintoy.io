---
author: tintoy
comments: true
date: 2012-12-14 20:40:42+10:00
layout: post
slug: type-matters-more-than-you-think-it-does
title: Type matters more than you think it does
wordpress_id: 301
categories:
- Code
- Design
---

Yes, yes, I know - I do keep hating on [`var`](http://msdn.microsoft.com/en-us/library/bb383973.aspx), but that's because people keep misunderstanding what it's for.

Recently, a colleague replied to my suggestion that C#'s `var` keyword actually decreases readability when used anywhere other than object-creation (eg. `new`), type-coercion (eg. cast / `as`), or anonymous type expressions with, "type matters less than you think it does". I think most of his work has been done in untyped languages (such as Javascript), so I can see where he is coming from. In those languages, typing really doesn't matter that much,

But I think he's wrong about this, when it comes to C#. Using `var` in C# frequently sets up behavioural expectations and intuitions that often turn out to be wrong because C# is a strongly-typed language; a fundamental part of its design philosophy is that typing **does** matter.
<!-- more -->

One example we were discussing is the situation where you want to retrieve a value from one function / property, and immediately pass it to another, without caring what it is, or even what type it is.

The problem is that this approach is that it **does not work** with C#. Even something as simple as method overloading can mess with it:

[code language="csharp"]
static class Program
{
	static void Main()
	{
		var items = GetSomeItems();
		int itemCount = Counting.GetItemCount(items);

		Debug.WriteLine(itemCount, "Item Count");
	}

	static string[] GetSomeItems()
	{
		return new string[]
		{
			"Baa",
			"baa",
			"black",
			"sheep",
			"have",
			"you",
			"any",
			"wool",
			"?"
		};
	}
}
[/code]

Imagine that the `Counting` class is implemented like this:

[code language="csharp"]
static class Counting
{
	public static int GetItemCount<T>(T[] array)
	{
		if (array == null)
			throw new ArgumentNullException("array");

		return array.Length;
	}

	public static int GetItemCount<T>(ICollection<T> collection)
	{
		if (collection == null)
			throw new ArgumentNullException("collection");

		return collection.Count;
	}

	public static int GetItemCount<T>(IEnumerable<T> enumerable)
	{
		if (enumerable == null)
			throw new ArgumentNullException("enumerable");

		return enumerable.Count();
	}

	public static int GetItemCount<T>(IQueryable<T> queryable)
	{
		if (queryable == null)
			throw new ArgumentNullException("queryable");

		return queryable.Count(); // Could be server-side eval.
	}
}
[/code]

Why? Because you want to support the same operation on multiple sequence / collection types, but utilise available facilities (such as item count) when present.

Now, it's pretty obvious that the first overload is going to be called. But this is only obvious because we have the code right in front of us.

If, some time later, the `GetSomeItems` method was changed like so:

[code language="csharp"]
static IEnumerable<string> GetSomeItems()
{
	yield return "Baa";
	yield return "baa";
	yield return "black";
	yield return "sheep";
	yield return "have";
	yield return "you";
	yield return "any";
	yield return "wool";
	yield return "?";
}
[/code]

Then a different overload of `Counting.GetItemCount` would be used. And you'd never know about it until you either stepped into it or used IntelliSense to examine the call in-place.

Why is this an issue? Consider the implementation of the method that is now being called:

[code language="csharp"]
public static int GetItemCount<T>(IEnumerable<T> enumerable)
{
	if (enumerable == null)
		throw new ArgumentNullException("enumerable");

	return enumerable.Count();
}
[/code]

The LINQ [Count<TSource>(IEnumerable<TSource>)](http://msdn.microsoft.com/en-us/library/bb338038.aspx) extension method has to iterate over the entire sequence in order to calculate the item count.

Now, maybe this is what you want - perhaps lazy eval of the sequence is what you intended when you changed the return type of `GetSomeItems()`. But the point is that, by changing the return type, you are changing the contract. And clients should find out about this, not just transparently switch over to using it, because the design has changed.

This is a trivial example, but not particularly unusual, and has fairly serious performance implications when you are dealing with large sequences. After all, O(n) is still a shitload worse than O(1).

This why I find it tooth-grindingly aggravating when I see code like:

[code language="csharp"]
int[] numbers = SomeFunction();

int numberCount = numbers.Count();
[/code]

Arrays have a `Length` property. It's a lot faster than iterating over every element in the array just to find out how many there are.

And if we're talking [IQueryable<T>](http://msdn.microsoft.com/en-us/library/bb351562.aspx) vs [IEnumerable<T>](http://msdn.microsoft.com/en-us/library/9eekhta0.aspx), then it could be even worse - you might transparently switch from server-side evaluation to client-side (with potentially disastrous results, in terms of performance).

And how about if you change a method's numeric return type's precision? Ugh.

So do yourself a favour - don't use C# as if type doesn't matter. Even if it doesn't matter in your favourite untyped language, in C#, it really REALLY does.

