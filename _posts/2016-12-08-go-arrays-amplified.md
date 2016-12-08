---
author: tintoy
comments: true
date: 2016-12-08 14:48:00+11:00
layout: post
slug: go-arrays-amplified
title: "Go: Generics? No. Amplified types? Yes!"
categories:
  - Go
  - Generics
  - Types
---

I've spent a fair bit of time recently working on a Terraform provider for Dimension Data CloudControl.
One of the bigger pain-points I've found is that for a system like Terraform (where schemas are really only known at runtime), you can't avoid passing things around as `interface{}`.

## Go doesn't do generics

Go seems to have managed to get along OK without generics, but the lack of them does make things a little inconvenient sometimes.
For one thing, I find myself spending a lot of time writing code like this:

```go
func getTags(data *schema.ResourceData) (tags []Tag) {
	value, ok := data.GetOk("tag")
	if !ok {
		return
	}
	tagData := value.(*schema.Set).List()

	tags = make([]Tag, len(tagData))
	for index, item := range tagData {
		tagProperties := item.(map[string]interface{})
		tag := &Tag{}

		value, ok = tagProperties["name"]
		if ok {
			tag.Name = value.(string)
		}

		value, ok = tagProperties["value"]
		if ok {
			tag.Value = value.(string)
		}

		tags[index] = *tag
	}

	return
}
```

Considering how little this function does, it's a lot to take in. This is even more painful when you realise that you'll need a different one for each data type you want to work with (including strings, ints, etc).

Yes, you can use something like [mapstructure](https://github.com/mitchellh/mapstructure) or [structs](https://github.com/fatih/structs) but they come with their own limitations (and I'm trying to keep these examples conceptually simple).

While you can't get away from that, you can at least make manipulating the resulting arrays a little easier.

## Generics? No. Amplified types? Yes!

What Go does allow you to do is declare custom types based on built-in data types (and then attach functions to them).
For example:

```go
type Tags []Tag

func (tags Tags) IsEmpty() bool {
	return len(tags) == 0
}

func (tags Tags) ByName() map[string]Tag {
	tagsByName := make(map[string]Tag)
	for _, tag := range tags {
		tagsByName[tag.Name] = tag
	}

	return tagsByName
}
func (tags Tags) GetByName(name string) *Tag {
	for _, tag := range tags {
		if tag.Name == name {
			return &tag
		}
	}

	return nil
}
```

So now you can:

```go
tags := Tags{
	Tag{
		Name = "a",
		Value = "b",
	},
	Tag{
		Name = "c",
		Value = "d",
	},
}

tagsByName := tags.ByName()
fmt.Println(tagsByName["a"]) // b
fmt.Println(tagsByName["c"]) // d

tagA := tags.GetByName("a")
fmt.Println(tagA.Value) // b
tagB := tags.GetByName("b")
fmt.Println(tagB.Value) // d
```

And if you have a regular `[]Tag`, you can easily turn it into a `Tags`:

```go
boringTags := []Tag{
	Tag{
		Name = "a",
		Value = "b",
	},
	Tag{
		Name = "c",
		Value = "d",
	},
}

cleverTags := Tags(boringTags)
tagsByName := tags.ByName()
fmt.Println(tagsByName["a"]) // b
fmt.Println(tagsByName["c"]) // d
```

### Why bother?

So why would you go to the effort of creating custom array types?

Because code is easier to read when you can focus on _what_ it does, rather than _how_ it does it.
Code that uses these amplified types allows the reader to more quickly navigate it by encapsulating typically noisy range operations into something more descriptive. 

With only a little fiddling, we can even update the array in-place:

```go
func (tags *Tags) ReadStateData(tagData []interface{}) {
	tagsFromStateData = make([]Tag, len(tagData))
	for index, item := range tagData {
		tagProperties := item.(map[string]interface{})
		tag := &Tag{}

		value, ok = tagProperties["name"]
		if ok {
			tag.Name = value.(string)
		}

		value, ok = tagProperties["value"]
		if ok {
			tag.Value = value.(string)
		}

		tagsFromStateData[index] = *tag
	}
	
	*tags = tagsFromStateData // Replace the tags with ones from state data.
}
```

Which enables you to do something like:

```go
value, ok := data.GetOk("tag")
if !ok {
	return
}
tagData := value.(*schema.Set).List()

tags := make(Tags, 0)
tags.ReadStateData(tagData)
```
