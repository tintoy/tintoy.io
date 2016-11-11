---
author: tintoy
comments: true
date: 2012-03-07 13:23:24+10:00
layout: post
slug: merge-sort
title: Merge-sort
wordpress_id: 97
categories:
- Algorithms
- Sorting
tags:
- algorithms
- sorting
---

Had a go at implementing merge-sort from memory (well, sort of - I've never done it before).

I think it would probably be worth modifying this algorithm to always pass the master array to each recursive call with start and end indices, rather than allocating new arrays for the left and right. That will probably be Monday's exercise (bit busy, this week).

It really is beautifully simple (well, OK, mine doesn't look totally simple, but that's mostly just error checking):

```csharp
/// <summary>
///    Sorting algorithms.
/// </summary>
public static class Sort
{
    /// <summary>
    ///    Perform a merge-sort on the specified array.
    /// </summary>
    /// <param name="array">
    ///    The array to sort.
    /// </param>
    /// <returns>
    ///    A sorted array.
    /// </returns>
    /// <remarks>
    ///    Uses <see cref="IComparable{TElement}"/> for comparisons.
    /// </remarks>
    /// <typeparam name="TElement">
    ///    The type of array element.
    /// </typeparam>
    public static TElement[] MergeSort<TElement>(this TElement[] array)
        where TElement : IComparable<TElement>
    {
        if (array == null)
            throw new ArgumentNullException("array");

        // An empty or single-element array is already sorted.
        if (array.Length < 2)
            return array;

        // Split the array down the middle.
        int midPoint = (array.Length / 2) - 1;
        TElement[] leftSegment, rightSegment;
        array.Split(midPoint, out leftSegment, out rightSegment);

        TElement[] leftSorted = MergeSort(leftSegment);
        TElement[] rightSorted = MergeSort(rightSegment);

        // Now combine the segments (this is where the sorting actually happens).
        TElement[] sortedElements = MergeElementsAscending(leftSorted, rightSorted);

        return sortedElements;
    }

    /// <summary>
    ///    Merge the elements from the specified arrays, in ascending order.
    /// </summary>
    /// <param name="array1">
    ///    The left array.
    /// </param>
    /// <param name="array2">
    ///    The right array.
    /// </param>
    /// <returns></returns>
    /// <typeparam name="TElement">
    ///    The array element type.
    /// </typeparam>
    static TElement[] MergeElementsAscending<TElement>(TElement[] array1, TElement[] array2)
        where TElement : IComparable<TElement>
    {
        TElement[] mergedElements = new TElement[array1.Length + array2.Length];
        int index1 = 0, index2 = 0, targetIndex = 0;
        while (index1 < array1.Length || index2 < array2.Length)
        {
            // Have we exhausted the first array?
            if (index1 >= array1.Length)
            {
                // Yes, so just copy the remaining entries from the second array.
                for (; index2 < array2.Length; index2++)
                    mergedElements[targetIndex++] = array2[index2];

                break;
            }

            // Have we exhausted the second array?
            if (index2 >= array2.Length)
            {
                // Yes, so just copy the remaining entries from the first array.
                for (; index1 < array1.Length; index1++)
                    mergedElements[targetIndex++] = array1[index1];

                break;
            }

            TElement element1 = array1[index1];
            if (element1 == null)
                throw new ArgumentException("Array cannot contain null values.", "array1");

            TElement element2 = array2[index2];
            if (element2 == null)
                throw new ArgumentException("Array cannot contain null values.", "array2");

            IComparable<TElement> element1Comparator = element1;
            int comparisonResult = element1Comparator.CompareTo(element2);
            if (comparisonResult < 0)
            {
                // Left is less, so use it.
                mergedElements[targetIndex++] = element1;
                index1++;
            }
            else
            {
                // Left is greater, so use the right one, instead.
                mergedElements[targetIndex++] = element2;
                index2++;
            }
        }

        return mergedElements;
    }
}
```

Oh, and one little utility function:

```csharp
/// <summary>
///    Utility functions.
/// </summary>
public static class Utilities
{
    /// <summary>
    ///    Split the specified array at the specified point.
    /// </summary>
    ///<param name="array">
    ///    The array to split.
    ///</param>
    ///<param name="left">
    ///    The part of the array with indices to the left of the centre-point of the array.
    ///</param>
    ///<param name="right">
    ///    The part of the array with indices to the right of the centre-point of the array.
    ///</param>
    ///<typeparam name="TElement">
    ///    The array element type.
    /// </typeparam>
    public static void Split<TElement>(this TElement[] array, out TElement[] left, out TElement[] right)
    {
        if (array == null)
            throw new ArgumentNullException("array");

        int splitPoint = (array.Length / 2) - 1;
        Split(array, splitPoint, out left, out right);
    }

    /// <summary>
    ///    Split the specified array at the specified point.
    /// </summary>
    ///<param name="array">
    ///    The array to split.
    ///</param>
    ///<param name="splitPoint">
    ///    The point at which to split.
    ///    0-based.
    ///</param>
    ///<param name="left">
    ///    The part of the array with indices less than or equal to <paramref name="splitPoint"/>.
    ///</param>
    ///<param name="right">
    ///    The part of the array with indices greater than <paramref name="splitPoint"/>.
    ///</param>
    ///<typeparam name="TElement">
    ///    The array element type.
    /// </typeparam>
    public static void Split<TElement>(this TElement[] array, int splitPoint, out TElement[] left, out TElement[] right)
    {
        if (array == null)
            throw new ArgumentNullException("array");

        if (splitPoint < 0 || splitPoint >= array.Length)
            throw new ArgumentOutOfRangeException("splitPoint", splitPoint, "Split-point must be between 0 and the array length.");

        // Special cases:
        // 1. Splitting an empty array produces 2 empty arrays.
        // 2. Splitting an array with 1 element produces a 1-element array (left), and an empty array (right).
        if (array.Length < 2)
        {
            right = new TElement[0];
            left = (array.Length == 1) ? new TElement[1] { array[0] } : new TElement[0];

            return;
        }

        int leftSize = splitPoint + 1;
        const int leftSourceStart = 0;
        left = new TElement[leftSize];
        Array.Copy(array, leftSourceStart, left, 0, leftSize);

        int rightSize = array.Length - leftSize;
        int rightSourceStart = leftSize;
        right = new TElement[rightSize];
        Array.Copy(array, rightSourceStart, right, 0, rightSize);
    }
}
```

I usually tend to err more on the side of using extra local variables than doing things inline; it makes the code easier to read, and the compiler / jitter usually knows when it can safely inline things, anyway.

_Edit:_Made a small change to the recursive sort to cut down on needless array allocations.
