---
author: tintoy
comments: true
date: 2012-02-10 21:58:26+10:00
layout: post
slug: a-simple-robot-arm-introduction
title: A simple robot arm (introduction)
wordpress_id: 18
categories:
- Algorithms
- Exercises
- Inverse Kinematics
- Robot Arm
tags:
- algorithms
- geometry
- maths
- problem
---

One of the problems I worked on, recently, was from ["Data Structures and Algorithms"](http://books.google.com.au/books/about/Data_structures_and_algorithms.html?id=AstQAAAAMAAJ&redir_esc=y) (this is, of course, only one interpretation of the problem; it could be done differently).

It seemed, at first, quite simple:


<blockquote>Imagine a robot arm, attached to a base-plate, with 2 joints, each of which can rotate up to 90° up and down in the vertical plane.

Determine the region that is reachable with the arm, and devise an algorithm for moving the arm to any reachable point in this region.</blockquote>


Here's a quick sketch of the arm (as I imagine it to be). Both arm segments are the same length, L, and the first and second joints have corresponding angles A and B:


[![Robot Arm Diagram #1](http://tintoy-blog.azurewebsites.net/wp-content/uploads/2012/02/RobotArmDiagram1-300x225.jpg)](http://tintoy-blog.azurewebsites.net/wp-content/uploads/2012/02/RobotArmDiagram1.jpg)


I'd recently been covering trigonometry, over at [Khan Academy](http://khanacademy.org/), so I figured it wouldn't be hard to calculate the angles involved.

As it turns out, this type of problem is called [inverse kinematics](http://en.wikipedia.org/wiki/Inverse_kinematics), and is a fairly well-researched area. In keeping with the spirit of things, I decided to ignore all that existing knowledge, and approach the problem as if it had never been solved before.
