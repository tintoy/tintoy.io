---
author: tintoy
comments: true
date: 2012-02-26 08:42:44+10:00
layout: post
slug: robot-arm-finally-cracked-it
title: Robot arm - finally cracked it
wordpress_id: 79
categories:
- Algorithms
- Exercises
- Inverse Kinematics
- Musings
- Robot Arm
---

I've spent the last 2 weeks, on and off, trying to work out why, once I'd split the robot arm code out into 3 different conceptual models (visual / presentation, internal, and physical), I could no longer correctly calculate the arm position given the joint angles.

**[diagrams will be up early next week]**

As it turns out, my major problem was that, for a first-joint angle of between 45 and 135 degrees, the system of equations representing the robot arm actually has 2 solutions (claw positioned above the second joint and claw positioned below the second joint) but, if you set the joint angles (as opposed to the servo angles), you don't have enough information to successfully calculate the claw postion (since you don't know whether the second joint angle is being measured as an inner or outer angle).

I only spotted it when doing my 12th diagram out on paper - I suddenly realised that, because I'd been drawing the diagrams by hand, I had subconsciously been choosing the correct angle for the second joint, every time, using information that would not be available to the algorithm (in this case, visual inspection).

In retrospect, it's obvious that I made a mistake in trying to retain the model's idea of the arm's state; it would have been better to only allow setting the servo positions, and always derive the internal angle values from them, when required.

So the takeaway lesson from all this is probably to carefully examine the different conceptual levels of your model(s) to see how information flows between them (and to watch for cases where information transfer is lossy and, therefore, one-way).
