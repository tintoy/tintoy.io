---
author: tintoy
comments: true
date: 2012-03-20 08:52:15+10:00
layout: post
slug: rot26-hur-hur-hur
title: ROT26 (hur hur hur)
wordpress_id: 132
categories:
- Algorithms
- Code
- Cryptography
- Strings
- Utility Classes
tags:
- algorithms
- code
---

In keeping with my policy of doing things the hard way, I sat down to try to work out how to perform ROT13 (or, more generally, ROTn) encryption. ROT13 is an extremely simple substitution cypher where each letter is replaced with the 13th letter ahead of it (wrapping around at 'Z' back to 'A'). A more generic problem description would be something like "value wrapping". This was what later gave me a clue as to a simpler solution, but more on that later.

My first approach was to use a lookup table. It's fast, but does require a bit of memory for the lookup table. In theory, a lookup table could be cached for each rotation value, but that's getting a little complicated. Still, if you had to do this over a large range of data, it could conceivably be worthwhile.

Here's the function I wrote to perform the rotation of the "plaintext" table to form a lookup table. I thought briefly about trying to do it in-place, but it seemed like an unnecessarily complication.

Essentially, this solution divides the range of values (letters, in this case) into 2 segments. All the values before the rotation point (if we're rotating forward by 3, then it's the values 0, 1, and 2) are in segment A, and all the values from the rotation point onwards are in segment B. To calculate the lookup table, we simply copy B to a new array, then append A.

```csharp
/// <summary>
///    Create a new array containing the elements of the specified array, but rotated by the specified amount.
/// </summary>
/// <param name="array">
///    The array.
/// </param>
/// <param name="rotateBy">
///    The number of elements to rotate by.
/// </param>
/// <typeparam name="TElement">
///    The array element type.
/// </typeparam>
static TElement[] Rotate<TElement>(TElement[] array, int rotateBy)
{
    if (array == null)
        throw new ArgumentNullException("array");

    if (rotateBy < 0)
        rotateBy += array.Length; // Since we're wrapping around, this is effectively the same thing.

    rotateBy %= array.Length; // Ensure we don't over-rotate.

    // Even if we don't actually need to rotate, retain copy-semantics.
    if (rotateBy == 0)
    {
        TElement[] copiedArray = new TElement[array.Length];
        Array.Copy(array, copiedArray, array.Length);

        return copiedArray;
    }

    TElement[] rotatedArray = new TElement[array.Length];
    // Copy segment B.
    for (int copyIndex = rotateBy; copyIndex < array.Length; copyIndex++)
        rotatedArray[copyIndex] = array[copyIndex - rotateBy];
    // Copy segment A.
    for (int copyIndex = 0; copyIndex < rotateBy; copyIndex++)
        rotatedArray[copyIndex] = array[copyIndex + (array.Length - rotateBy)];

    return rotatedArray;
}
```

Performing ROT13 decryption is then simply a matter of performing a direct indexed lookup of the corresponding character in the rotated lookup table.

But there are 2 simpler methods that don't require a lookup table.





  1. Calculate the index using addition and subtraction


  2. Calculate the index using [modular arithmetic](http://en.wikipedia.org/wiki/Modular_arithmetic)



My first attempt (before it occurred to me to use modular arithmetic) was to simply calculate the relative position (depending on whether the initial index value was in virtual segment A or virtual segment B; virtual, because there is no actual array this time):

```csharp
/// <summary>
///    Rotate the specified index by the specified amount.
/// </summary>
/// <param name="index">
///    The index value.
///
///    Only positive values are supported, for now.
/// </param>
/// <param name="wrapAt">
///    The first 0-based value after which the indices start to wrap.
/// </param>
/// <param name="rotateBy">
///    The number of elements to rotate by.
/// </param>
/// <returns>
///    The rotated index.
/// </returns>
static int RotateIndex(int index, int wrapAt, int rotateBy)
{
    if (index < 0)
        throw new ArgumentOutOfRangeException("index", index, "Only positive indices are supported.");

    // We actually want wrapAt to be 1-based.
    wrapAt += 1;
    if (rotateBy < 0)
        rotateBy += wrapAt; // Since this is the wrapping point, this is effectively the same thing.

    // Don't wrap if we don't need to.
    rotateBy %= wrapAt;
    if (rotateBy == 0)
        return index;

    int rotatedIndex;
    if (index < rotateBy)
        rotatedIndex = index + wrapAt - rotateBy;
    else
        rotatedIndex = index - rotateBy;

    return rotatedIndex;
}
```

It works, but it seemed inefficient, and that if-else statement was bothering me (basically, if-else in a formula usually means it's piecemeal, which is somewhat inelegant).

It's worth noting, at this point, that we don't need any special code to handle negative rotation values (this became obvious once I started drawing out the arrays and their relative indices). This is because values wrap, so rotating left by `R` is the same thing as rotating right by `Length - R`.

Here's the version using modular arithmetic:

```csharp
/// <summary>
///    Wrap the specified number around a pivot point.
/// </summary>
/// <param name="value">
///    The 0-based value to rotate.
///
///    Cannot be less than 0.
/// </param>
/// <param name="pivot">
///    The first value that should wrap around to 0.
/// </param>
/// <param name="rotateBy">
///    The number of places to rotate the value by.
/// </param>
/// <returns>
///    The rotated value.
/// </returns>
/// <remarks>
///    The value will be rotated by the specified amount, and will be wrapped around to continue through 0 if it reaches the <paramref name="pivot"/> value.
/// </remarks>
static int Wrap(int value, int pivot, int rotateBy)
{
    if (value < 0)
        throw new ArgumentOutOfRangeException("value", value, "Value cannot be less than 0.");

    if (pivot < 1) // Otherwise, why are you trying to wrap?
        throw new ArgumentOutOfRangeException("pivot", pivot, "The first value that should be wrapped around to 0 cannot be less than 1.");

    if (rotateBy < 0)
        rotateBy += pivot; // Since values wrap, these are equivalent operations.

    return (value + rotateBy) % pivot;
}
```

And, finally, here's the character rotation function:

```csharp
/// <summary>
///    Rotate the specified alpha character by the specified amount.
/// </summary>
/// <param name="ch">
///    The character to rotate.
/// </param>
/// <param name="rotateBy">
///    The number of places to rotate the character by.
/// </param>
/// <returns>
///    The rotated character.
/// </returns>
/// <remarks>
///    Only 'A'..'Z' and 'a'..'z' are rotated; all other characters are returned unchanged.
///    Not particularly Unicode-friendly.
/// </remarks>
static char RotateAlpha(char ch, int rotateBy)
{
    const int charCountAToZ = 'z' - 'a' + 1;
    if (rotateBy < 0)
        rotateBy += charCountAToZ; // Since values wrap, these are equivalent operations.

    if ('a' <= ch && ch <= 'z')
        return (char)('a' + (ch + rotateBy - 'a') % charCountAToZ);
    if ('A' <= ch && ch <= 'Z')
        return (char)('A' + (ch + rotateBy - 'A') % charCountAToZ);

    return ch;
}
```
