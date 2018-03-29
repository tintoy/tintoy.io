---
title: How does Intellisense work?
author: tintoy
comments: true
layout: post
slug: how-does-intellisense-work
categories:
  - Intellisense
  - VS Code
  - Language Service
  - Parsing
---

## What is Intellisense?

Many modern editors have features to make life easier when working code, markup, and other types of structured text. Collectively, Microsoft calls these features "Intellisense" and they include features such as quick-info and parameter-help tooltips, completions, go-to-definition, and many more.

![VSCode intellisense in action](../assets/img/2017/intellisense-in-action.gif)

Many of us use it every day, but have you ever wondered what's going on behind the scenes to make it happen?
<!-- more -->

## First stop: types of Intellisense

Intellisense features can be roughly divided into 2 categories:

* **Contextual**  
  Can include information from elsewhere, but usually focused on the current position in the text.
* **Global**  
  Independent of current position in the text (you don't even need to have an open document).

### Contextual Intellisense

* Completions
* Tooltips (signature help / parameter help / quick info)
* Go to definition
* CodeLense
* Editor decorations
  * Red squiggle on invalid syntax

### Global intellisense

* Diagnostics (i.e. errors and warnings)
* Go to symbol
* Find all references

## Next stop: Compilers

Most compilers have 4 stages:

* Lexical analysis (often called _lexing_)  
  Processing the source text into a sequence of _tokens_.
* Syntax analysis (often called _parsing_)  
  Parsing the tokens to produce a syntactic model, usually an _Abstract Syntax Tree_ (AST).
* Semantic analysis  
  Analysing the syntactic model to determine what things _mean_.  
  The semantic model varies from language to language.
* Generation (generate appropriate artifacts)

### Compilers: a worked example (simplified)

#### Lexical analysis

The lexer turns a stream of characters into discrete tokens:

Before: `_count == 5`

After:

* `Identifier(_count)`
* `Whitespace( )`
* `Operator(==)`
* `Whitespace( )`
* `IntegerLiteral(5)`

#### Syntactic analysis

The parser turns a stream of tokens into an AST.

Before:

* `Identifier(_count)`
* `Whitespace( )`
* `Operator(==)`
* `Whitespace( )`
* `IntegerLiteral(5)`

After:

* `EqualityExpression`
  * `Left`: `Symbol(_count)`
  * `Right`: `IntegerLiteral(5)`

---

#### Semantic analysis

The compiler refines and interprets the AST.

Before:

* `EqualityExpression`
  * `Left`: `Symbol(_count)`
  * `Right`: `IntegerLiteral(5)`

After:

* `Equality(ExpressionType:Boolean)`
  * `Left`: `Field(Class1::_count), Type=Symbol(Int32), Target=This`
  * `Right`: `Int32Literal(5)`

## Compiler vs. Language Service

* A compiler's job is to _transform_ the source text and _generate outputs_.
* A language service's job is to _understand_ the source text and _answer questions_ about it.

### The Compiler's job

* `'Foo.cs' -> 'Foo.exe'`
* `'Strings.resx' -> 'Strings.resources'`

### The Language service's job

* "What does the identifier at line 3, column 6 mean?"
* "Where is the class `HomeController` used?"

## So what does a language service actually DO?

Here's some source text:

![raw](/assets/img/2017/ls-goggles-raw.jpg)

Let's put on our language-service goggles! What does the language service see?

### Tokens

Break up the text into tokens such as:

![raw](/assets/img/2017/ls-goggles-tokens.jpg)

* LessThanToken (`<`)
* NameToken (`Element1`)
* GreaterThanToken (`>`)
* (etc)

### Syntax

Parse the tokens into a syntax tree:

![raw](/assets/img/2017/ls-goggles-syntax.jpg)

* `OpenElement(Name=Element1)`
  * `OpenElement(Name=Element2)`
  * `Attribute(Name=Attribute1,Value=Value1)`
  * `EmptyElement(Name=Element3)`
  * `EmptyElement(Name=Element4)`
  * `CloseElement(Name=Element2)`
  * `OpenElement(Name=Element5)`
  * `CloseElement(Name=Element5)`
* `CloseElement(Name=Element1)`

### Semantic Model

* `Element(Name=Element1,Prefix=,Namespace=None)`
  * `Element(Name=Element2,Prefix=,Namespace=)`
    * `Attribute(Name=Attribute1,Prefix=,Namespace=,Value=Value1)`
    * `Element(Name=Element3,Prefix=,Namespace=)`
    * `Element(Name=Element4,Prefix=,Namespace=)`
  * `Element(Name=Element5,Prefix=,Namespace=)`

## How is this useful?

Ask the language service what's on line 2:

> `Element(Name=Element2,Prefix=,Namespace=)`
> `Attribute(Name=Attribute1,Prefix=,Namespace=,Value=Value1)`

Ask the language service what completions can be offered in the whitespace before `Attribute1`:

> Containing element is `Element2`, which has 2 possible attributes
> (`Attribute1` and `Attribute2`); `Attribute1` is already present, so:
>
> 1 completion: `Attribute2=""`
