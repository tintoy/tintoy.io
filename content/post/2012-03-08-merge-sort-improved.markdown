---
author: tintoy
comments: true
date: 2012-03-08 11:44:26+10:00
layout: post
slug: merge-sort-improved
title: Merge-sort (improved)
wordpress_id: 114
categories:
- Algorithms
- Code
- Sorting
- Utility Classes
tags:
- algorithms
- code
- sorting
---

I've never liked methods that need to return more than one value; I can see the point of returning a value and a status flag (such as the BCL's TryXXX methods, which enable you to avoid having to catch an exception just to discover whether an operation is possible), but returning 2 values (even if they're related) just feels like ugly design to me. This is why I was unhappy with my first attempt at array-splitting. Well, that and the need to keep copying data around.

To this end, I wanted to refactor the array-splitting logic so that it could (without incurring twice the cost), slice up the array in 2 separate operations (each of which returned a single slice).

I have always maintained that [ArraySegment<T>](http://msdn.microsoft.com/en-us/library/1hsbd92d.aspx) might very well be the most useless class in the entire .NET BCL. The concept seemed so promising - a way of wrapping an array with a lightweight structure which simplifies access to a subset of its elements. But that's not how ArraySegment<T> works. No, it simply holds the underling array and an integer offset as public properties. No bloody indexer; it's basically a tuple. Woop-te-do.

So here's my take on how an array slice should work. I borrowed some ideas from Python's notion of [array-slicing](http://structure.usc.edu/numarray/node26.html) (specifically, the idea of slicing a slice into sub-slices, and allowing a sub-slice's values to be pushed back into a larger slice (set, not inserted).

```csharp
/// <summary>
///    A slice of an array.
/// </summary>
/// <remarks>
///    All indices are 0-based.
/// </remarks>
public struct ArraySlice<TElement>
    : IEnumerable<TElement>
{
    #region Instance data----------------------------------------------------------

    /// <summary>
    ///    The underlying array.
    /// </summary>
    readonly TElement[]        _array;

    /// <summary>
    ///    The slice start index.
    /// </summary>
    readonly int            _startIndex;

    /// <summary>
    ///    The slice end index.
    /// </summary>
    readonly int            _endIndex;

    #endregion // Instance data

    #region Construction-----------------------------------------------------------

    /// <summary>
    ///    Create a new array slice containing an entire array.
    /// </summary>
    /// <param name="array">
    ///    The array to wrap.
    /// </param>
    public ArraySlice(TElement[] array)
    {
        if (array == null)
            throw new ArgumentNullException("array");

        _array = array;
        _startIndex = 0;
        _endIndex = _array.Length - 1;
    }

    /// <summary>
    ///    Create a new array slice.
    /// </summary>
    /// <param name="array">
    ///    The array to slice.
    /// </param>
    /// <param name="startIndex">
    ///    The slice start index.
    /// </param>
    /// <param name="endIndex">
    ///    The slice end index.
    /// </param>
    public ArraySlice(TElement[] array, int startIndex, int endIndex)
    {
        if (array == null)
            throw new ArgumentNullException("array");

        if (startIndex < 0 || startIndex > endIndex)
            throw new ArgumentOutOfRangeException("startIndex", startIndex, "Start index must be between 0 and end index.");

        if (endIndex > array.Length - 1)
            throw new ArgumentOutOfRangeException("endIndex", endIndex, "End index must be between startIndex and the last index of the array.");

        _array = array;
        _startIndex = startIndex;
        _endIndex = endIndex;
    }

    /// <summary>
    ///    Create a new array slice by further slicing an existing slice.
    /// </summary>
    /// <param name="arraySlice">
    ///    The array slice to re-slice.
    /// </param>
    /// <param name="startIndex">
    ///    The slice start index, relative to the existing slice start index.
    /// </param>
    /// <param name="endIndex">
    ///    The slice end index, relative to the existing slice start index.
    /// </param>
    ArraySlice(ArraySlice<TElement> arraySlice, int startIndex, int endIndex)
    {

        if (startIndex < 0 || startIndex > endIndex)
            throw new ArgumentOutOfRangeException("startIndex", startIndex, "Start index must be between 0 and end index.");

        if (endIndex > arraySlice.Length - 1)
            throw new ArgumentOutOfRangeException("endIndex", endIndex, "End index must be between startIndex and the last index of the existing slice.");

        _array = arraySlice._array;
        _startIndex = arraySlice._startIndex + startIndex;
        _endIndex = _startIndex + (endIndex - startIndex);
    }

    #endregion // Construction

    #region Indexers---------------------------------------------------------------

    /// <summary>
    ///    The element at the specified index.
    /// </summary>
    /// <param name="index">
    ///    The index, within the slice, of the element.
    /// </param>
    /// <returns>
    ///    The element.
    /// </returns>
    public TElement this[int index]
    {
        get
        {
            if (index < 0)
                throw new ArgumentOutOfRangeException("index", index, "The specified index must be greater than or equal to 0.");

            if (index > _endIndex - _startIndex)
                throw new ArgumentOutOfRangeException("index", index, "The specified index must be less than the slice length.");

            return _array[_startIndex + index];
        }
        set
        {
            if (index < 0)
                throw new ArgumentOutOfRangeException("index", index, "The specified index must be greater than or equal to 0.");

            if (index > _endIndex - _startIndex)
                throw new ArgumentOutOfRangeException("index", index, "The specified index must be less than the slice length.");

            _array[_startIndex + index] = value;
        }
    }

    /// <summary>
    ///    A sub-slice.
    /// </summary>
    /// <param name="startIndex">
    ///    The sub-slice start index, relative to the slice start index.
    /// </param>
    /// <param name="endIndex">
    ///    The sub-slice end index, relative to the slice start index.
    /// </param>
    /// <returns></returns>
    public ArraySlice<TElement> this[int startIndex, int endIndex]
    {
        get
        {
            if (startIndex < 0 || startIndex > endIndex)
                throw new ArgumentOutOfRangeException("startIndex", startIndex, "Start index must be between 0 and end index.");

            if ((endIndex - startIndex) > (_endIndex - startIndex))
                throw new ArgumentOutOfRangeException("endIndex", endIndex, "The difference between end index and start index must be less than the difference between the existing slice's end index and start index.");

            return new ArraySlice<TElement>(this, startIndex, endIndex);
        }
        set
        {
            if (startIndex < 0 || startIndex > endIndex)
                throw new ArgumentOutOfRangeException("startIndex", startIndex, "Start index must be between 0 and end index.");

            if (endIndex > (_endIndex - startIndex))
                throw new ArgumentOutOfRangeException("endIndex", endIndex, "End index must be between startIndex and the last index of the existing slice.");

            int sliceSize = endIndex - startIndex + 1;
            if (sliceSize > Length)
                throw new ArgumentException("The specified slice is larger than current slice.", "value");

            if (sliceSize > value.Length)
                throw new ArgumentException("The range specified by the specified start and end indices are larger than the supplied array slice.", "value");

            for (int sliceIndex = startIndex; sliceIndex <= endIndex; sliceIndex++)
                _array[_startIndex + sliceIndex] = value[sliceIndex];
        }
    }

    #endregion // Indexers

    #region Public properties------------------------------------------------------

    /// <summary>
    ///    The slice start index.
    /// </summary>
    public int StartIndex
    {
        get
        {
            return _startIndex;
        }
    }

    /// <summary>
    ///    The slice end index.
    /// </summary>
    public int EndIndex
    {
        get
        {
            return _endIndex;
        }
    }

    /// <summary>
    ///    The slice length.
    /// </summary>
    public int Length
    {
        get
        {
            return _endIndex - _startIndex + 1;
        }
    }

    #endregion // Public properties

    #region Public methods---------------------------------------------------------

    /// <summary>
    ///    Get the slice contents, as an array.
    /// </summary>
    /// <returns>
    ///    An array containing the slice elments.
    /// </returns>
    public TElement[] ToArray()
    {
        int length = Length;
        TElement[] array = new TElement[length];
        for (int sliceIndex = 0; sliceIndex < length; sliceIndex++)
            array[sliceIndex] = this[sliceIndex];

        return array;
    }

    #endregion // Public methods

    #region IEnumerable<out TElement> implementation-------------------------------

    /// <summary>
    ///    Get an enumerator that iterates through the elements of the array slice.
    /// </summary>
    /// <returns>
    ///    A <see cref="IEnumerator{TElement}"/> implementation that can be used to iterate through the array slice.
    /// </returns>
    public IEnumerator<TElement> GetEnumerator()
    {
        for (int arrayIndex = _startIndex; arrayIndex <= _endIndex; arrayIndex++)
            yield return _array[arrayIndex];
    }

    #endregion // IEnumerable<out TElement> implementation

    #region IEnumerable implementation---------------------------------------------

    /// <summary>
    ///    Get an untyped enumerator that iterates through the elements of the array slice.
    /// </summary>
    /// <returns>
    ///    An <see cref="T:System.Collections.IEnumerator"/> implementation that can be used to iterate through the array slice.
    /// </returns>
    /// <filterpriority>2</filterpriority>
    IEnumerator IEnumerable.GetEnumerator()
    {
        return GetEnumerator();
    }

    #endregion // IEnumerable implementation
}
```

One of the major advantages of this data structure is that it is light-weight; the merge-sort algorithm no longer needs to copy data to sub-arrays before recursively processing it. Now, it simply slices the already-sliced array to create a sub-slice (a very light-weight operation, since no array data is copied) and then passes it to the next call.

And here are the extension methods to slice arrays:

```csharp
/// <summary>
///    Array functions.
/// </summary>
public static class Arrays
{
    /// <summary>
    ///    Slice the specified array at the specified point.
    /// </summary>
    ///<param name="array">
    ///    The array to slice.
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
    public static void Slice<TElement>(this TElement[] array, out ArraySlice<TElement> left, out ArraySlice<TElement> right)
    {
        if (array == null)
            throw new ArgumentNullException("array");

        int slicePoint = (array.Length / 2) - 1;
        Slice(array, slicePoint, out left, out right);
    }

    /// <summary>
    ///    Split the specified array at the specified point.
    /// </summary>
    ///<param name="array">
    ///    The array to split.
    ///</param>
    ///<param name="slicePoint">
    ///    The point at which to split.
    ///    0-based.
    ///</param>
    ///<param name="left">
    ///    The part of the array with indices less than or equal to <paramref name="slicePoint"/>.
    ///</param>
    ///<param name="right">
    ///    The part of the array with indices greater than <paramref name="slicePoint"/>.
    ///</param>
    ///<typeparam name="TElement">
    ///    The array element type.
    /// </typeparam>
    public static void Slice<TElement>(this TElement[] array, int slicePoint, out ArraySlice<TElement> left, out ArraySlice<TElement> right)
    {
        if (array == null)
            throw new ArgumentNullException("array");

        if (slicePoint < 0 || slicePoint >= array.Length)
            throw new ArgumentOutOfRangeException("slicePoint", slicePoint, "Split-point must be between 0 and the array length.");

        // Special cases:
        // 1. Splitting an empty array produces 2 empty arrays.
        // 2. Splitting an array with 1 element produces a 1-element array (left), and an empty array (right).
        if (array.Length < 2)
        {
            left = new ArraySlice<TElement>(array);
            right = new ArraySlice<TElement>(array, slicePoint, slicePoint); // Which is an empty slice.

            return;
        }

        int leftSize = slicePoint + 1;
        const int leftSourceStart = 0;
        left = new ArraySlice<TElement>(array, leftSourceStart, leftSourceStart + leftSize - 1);

        int rightSize = array.Length - leftSize;
        int rightSourceStart = leftSize;
        right = new ArraySlice<TElement>(array, rightSourceStart, rightSourceStart + rightSize - 1);
    }
}
```
