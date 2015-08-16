---
author: tintoy
comments: true
date: 2012-02-14 09:00:57+10:00
layout: post
slug: musings-on-implementation
title: Musings on implementation
wordpress_id: 68
categories:
- GDI+
- Musings
- Windows Forms
tags:
- gdiplus
- musings
- winforms
---

One of the biggest challenges, I've noticed, when trying to create an emulation of a real-world system or process, is that I often get bogged down, switching between a simplified representation of the software system's state (eg. the graphics display) and the underlying algorithm and / or data model.

It's just a matter of discipline and perspective, of course. But when you've been working on something for 15 hours straight, a certain kind of blindness creeps in...

With the robot arm, for example, I originally tried to keep things simple by just inverting the y-axis (to map between cartesian and top-down coordinates) and then drawing the angles as they actually were, but offset by 90 degrees, where necessary. As it turned out, this wound up costing me a day of troubleshooting before I remembered that I was failing to differentiate between the robot arm's idea of its joints' declinations and the graphics display's representation of them.

If I'd been a little more disciplined and, as I'd originally planned, separated out the rendering code using an adapter pattern, then it would not have been an issue. Instead, my mapping algorithm had the translation logic half-embedded in it, and half-embedded in the form's render logic (yes, I'm ashamed to say that I had the rendering code right inside the DrawingPanel_Paint event handler).

Once I split it out into separate classes (one to handle all the trig calculations for the arm, and one to handle rendering to a Graphics object), it was easy to see where the problem was.

Being a little out of practice with WinForms, it was only after writing the adapter code that I remembered I could have avoided flipping the y-axis in my calculations by simply calling [panelGraphics.ScaleTransform(1, -1)](http://msdn.microsoft.com/en-us/library/zhc2xxtx.aspx). Oh well.

I also worked out, this time, that I can move the origin, before drawing, by calling [panelGraphics.TranslateTransform(0, panelGraphics.Height / 2)](http://msdn.microsoft.com/en-us/library/6a1d65f4.aspx).

I'll post the code, soon, once I've had a chance to finally tidy it up. Hopefully sometime this week, and then it's on to the next problem.


