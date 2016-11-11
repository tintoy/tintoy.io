---
author: tintoy
comments: true
date: 2012-02-11 05:59:39+10:00
layout: post
slug: a-simple-robot-arm-the-first-approach
title: A simple robot arm - the first approach
wordpress_id: 35
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

A useful technique when trying to solve a problem is to see if there's a simpler version of the problem that you can solve.

In this case, I figured it would be fairly trivial to make a robot arm that only moves backwards and forwards on the x-axis. As it turns out, all this requires, is for angle B to be exactly twice angle A.

[![Robot Arm Diagram #1](/assets/img/2012/02/RobotArmDiagram1.jpg)](/assets/img/2012/02/RobotArmDiagram1.jpg)

Make sense? How about now?

[![Robot Arm (With Isoscelese Triangles)](/assets/img/2012/02/Robot-Arm-With-Isoscelese-Triangles.jpg)](/assets/img/2012/02/Robot-Arm-With-Isoscelese-Triangles.jpg)

That's right; the lines I drew are parallel, so the alternate angles are equal. Double it for the entire triangle, Bob's your uncle.

In the next entry, I'll describe how we perform ranging (determine what angles to actually use based on the distance to the target).
