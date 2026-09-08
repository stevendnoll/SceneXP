// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * playbook.js - The play diagrams, drawn in 2D on purpose.
 *
 * PORTED FROM THE 2D GAME's playbook.class.tsx (D7). A play diagram IS a
 * diagram: flat, schematic, read at a glance. Rendering these in 3D would make
 * them harder to read in exchange for nothing, so they stay exactly what they
 * were, drawn with a 2D canvas context into the DOM overlay above the scene.
 *
 * THIS IS A VIEW MODULE, NOT SIMULATION. It touches `document` and is excluded
 * from the purity rule that governs motion, routes, formations and playstate.
 *
 * Each drawPlayN takes a CSS selector and finds its own canvas, which is how
 * the 2D game called it and is left alone. The mapping from a play's slug to
 * its diagram number is not in this file: see PLAY_DIAGRAMS in playbook-ui.js,
 * read off the 2D game's PlaybookOverlay component.
 *
 * The only edits were mechanical: TypeScript annotations stripped and the class
 * exported as an ES module. No coordinate was touched.
 */

export class OffensivePlaybookClass {

  constructor(settings = {}) {
    this.settings = settings;
  }

  canvasDrawBall(ctx, x, y) {
    ctx.fillStyle = 'rgb(111, 15, 10)';
    ctx.beginPath();
    ctx.ellipse(x, y, 8, 5, Math.PI, 0, 2 * Math.PI);
    ctx.fill();
    ctx.closePath();

    ctx.strokeStyle = 'rgb(255, 255, 255)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo((x - 3), y);
    ctx.lineTo((x + 3), y);
    ctx.stroke();
    ctx.closePath();
  }

  canvasDrawLine(ctx, x1, y1, x2, y2, rgba, width) {
    if ( typeof(rgba) !== 'undefined' && rgba ) {
      ctx.strokeStyle = 'rgba(' + rgba + ')';
    }
    if ( typeof(width) !== 'undefined' && width ) {
      ctx.lineWidth = width;
    }
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.closePath();
  }

  canvasDrawText(ctx, val, x, y, font, rgba, textAlign) {
    ctx.font = font;
    ctx.fillStyle = 'rgba(' + rgba + ')';
    ctx.textAlign = textAlign;
    ctx.fillText(val, x, y);
  }

  drawPlay1(canvasSelector = '') {
    // eslint-disable-next-line
    const canvas = document.querySelector(canvasSelector);
    if ( canvas ) {
      const ctx = canvas.getContext('2d');
      if ( ctx ) {
        const maxLineX = (ctx.canvas.width - 60);
        const maxArrowX = (ctx.canvas.width - 70);
        // Clear.
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.fillStyle = 'rgb(235, 235, 235)';
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        // A.
        this.canvasDrawText(ctx, 'A', 50, 28, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // A line.
        this.canvasDrawLine(ctx, 64, 20, maxLineX, 20, '125, 0, 0, 0.8', 1);
        this.canvasDrawLine(ctx, maxLineX, 20, maxArrowX, 14, '125, 0, 0, 0.8', 1);
        this.canvasDrawLine(ctx, maxLineX, 20, maxArrowX, 26, '125, 0, 0, 0.8', 1);
        // B.
        this.canvasDrawText(ctx, 'B', 60, 58, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // B Line.
        this.canvasDrawLine(ctx, 74, 50, 114, 50, '0, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, 114, 50, 164, 128, '0, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, 164, 128, maxLineX, 128, '0, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, maxLineX, 128, maxArrowX, 122, '0, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, maxLineX, 128, maxArrowX, 134, '0, 0, 125, 0.8', 1);
        // X.
        this.canvasDrawText(ctx, 'X', 40, 82, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // Draw ball.
        this.canvasDrawBall(ctx, 32, 67);
        // C.
        this.canvasDrawText(ctx, 'C', 60, 106, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // C line.
        this.canvasDrawLine(ctx, 74, 98, maxLineX, 98, '125, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, maxLineX, 98, maxArrowX, 92, '125, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, maxLineX, 98, maxArrowX, 104, '125, 0, 125, 0.8', 1);
        // D.
        this.canvasDrawText(ctx, 'D', 50, 136, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // D line.
        this.canvasDrawLine(ctx, 64, 132, 98, 132, '0, 125, 0, 0.8', 1);
        this.canvasDrawLine(ctx, 98, 132, 128, 68, '0, 125, 0, 0.8', 1);
        this.canvasDrawLine(ctx, 128, 68, maxLineX, 68, '0, 125, 0, 0.8', 1);
        this.canvasDrawLine(ctx, maxLineX, 68, maxArrowX, 62, '0, 125, 0, 0.8', 1);
        this.canvasDrawLine(ctx, maxLineX, 68, maxArrowX, 74, '0, 125, 0, 0.8', 1);
        // Draw.
        this.canvasDrawLine(ctx, 86, 0, 86, ctx.canvas.height, '0, 125, 0, 0.4', 1);
      }
    }
  }

  drawPlay2(canvasSelector = '') {
    // eslint-disable-next-line
    const canvas = document.querySelector(canvasSelector);
    if ( canvas ) {
      const ctx = canvas.getContext('2d');
      if ( ctx ) {
        const maxLineX = (ctx.canvas.width - 60);
        const arrowX = 10;
        const arrowY = 6;
        const arrowXVert = 7;
        const arrowYVert = 8;
        // Clear.
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.fillStyle = 'rgb(235, 235, 235)';
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        // A.
        this.canvasDrawText(ctx, 'A', 50, 28, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // A line.
        this.canvasDrawLine(ctx, 64, 20, maxLineX, 20, '125, 0, 0, 0.8', 1);
        this.canvasDrawLine(ctx, maxLineX, 20, maxLineX, 104, '125, 0, 0, 0.8', 1);
        this.canvasDrawLine(ctx, maxLineX, 104, maxLineX - arrowXVert, 104 - arrowYVert, '125, 0, 0, 0.8', 1);
        this.canvasDrawLine(ctx, maxLineX, 104, maxLineX + arrowXVert, 104 - arrowYVert, '125, 0, 0, 0.8', 1);
        // B.
        this.canvasDrawText(ctx, 'B', 65, 122, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // B Line.
        this.canvasDrawLine(ctx, 79, 114, 135, 114, '0, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, 135, 114, 195, 32, '0, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, 195, 32, maxLineX - 10, 32, '0, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, maxLineX - 10, 32, maxLineX - 10 - arrowX, 32 - arrowY, '0, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, maxLineX - 10, 32, maxLineX - 10 - arrowX, 32 + arrowY, '0, 0, 125, 0.8', 1);
        // X.
        this.canvasDrawText(ctx, 'X', 40, 82, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // Draw ball.
        this.canvasDrawBall(ctx, 32, 67);
        // C.
        this.canvasDrawText(ctx, 'C', 45, 108, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // C line.
        this.canvasDrawLine(ctx, 59, 100, 95, 100, '125, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, 95, 100, 115, 78, '125, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, 115, 78, maxLineX - 10, 78, '125, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, maxLineX - 10, 78, maxLineX - 10 - arrowX, 78 - arrowY, '125, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, maxLineX - 10, 78, maxLineX - 10 - arrowX, 78 + arrowY, '125, 0, 125, 0.8', 1);
        // D.
        this.canvasDrawText(ctx, 'D', 45, 136, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // D line.
        this.canvasDrawLine(ctx, 59, 128, 175, 128, '0, 125, 0, 0.8', 1);
        this.canvasDrawLine(ctx, 175, 128, maxLineX - 10, 46, '0, 125, 0, 0.8', 1);
        this.canvasDrawLine(ctx, maxLineX - 10, 46, maxLineX - 10 - 13, 46 + 7, '0, 125, 0, 0.8', 1);
        this.canvasDrawLine(ctx, maxLineX - 10, 46, maxLineX - 10 -1, 46 + 15, '0, 125, 0, 0.8', 1);
        // Draw.
        this.canvasDrawLine(ctx, 86, 0, 86, ctx.canvas.height, '0, 125, 0, 0.4', 1);
      }
    }
  }

  drawPlay3(canvasSelector = '') {
    // eslint-disable-next-line
    const canvas = document.querySelector(canvasSelector);
    if ( canvas ) {
      const ctx = canvas.getContext('2d');
      if ( ctx ) {
        const maxLineX = (ctx.canvas.width - 60);
        const arrowX = 10;
        const arrowY = 6;
        // Clear.
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.fillStyle = 'rgb(235, 235, 235)';
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        // A.
        this.canvasDrawText(ctx, 'A', 60, 28, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // A line.
        this.canvasDrawLine(ctx, 74, 20, 140, 20, '125, 0, 0, 0.8', 1);
        this.canvasDrawLine(ctx, 140, 20, 200, 136, '125, 0, 0, 0.8', 1);
        this.canvasDrawLine(ctx, 200, 136, maxLineX, 136, '125, 0, 0, 0.8', 1);
        this.canvasDrawLine(ctx, maxLineX, 136, maxLineX - arrowX, 136 - arrowY, '125, 0, 0, 0.8', 1);
        this.canvasDrawLine(ctx, maxLineX, 136, maxLineX - arrowX, 136 + arrowY, '125, 0, 0, 0.8', 1);
        // B.
        this.canvasDrawText(ctx, 'B', 50, 58, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // B Line.
        this.canvasDrawLine(ctx, 64, 52, 92, 52, '0, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, 92, 52, 126, 10, '0, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, 126, 10, maxLineX, 10, '0, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, maxLineX, 10, maxLineX - arrowX, 10 - arrowY, '0, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, maxLineX, 10, maxLineX - arrowX, 10 + arrowY, '0, 0, 125, 0.8', 1);
        // X.
        this.canvasDrawText(ctx, 'X', 40, 82, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // Draw ball.
        this.canvasDrawBall(ctx, 32, 67);
        // C.
        this.canvasDrawText(ctx, 'C', 50, 106, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // C line.
        this.canvasDrawLine(ctx, 64, 100, 165, 100, '125, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, 165, 100, maxLineX, 52, '125, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, maxLineX, 52, maxLineX - 14, 52, '125, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, maxLineX, 52, maxLineX - 4, 52 + 14, '125, 0, 125, 0.8', 1);
        // D.
        this.canvasDrawText(ctx, 'D', 60, 136, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // D line.
        this.canvasDrawLine(ctx, 74, 130, 175, 130, '0, 125, 0, 0.8', 1);
        this.canvasDrawLine(ctx, 175, 130, maxLineX, 90, '0, 125, 0, 0.8', 1);
        this.canvasDrawLine(ctx, maxLineX, 90, maxLineX - 14, 90, '0, 125, 0, 0.8', 1);
        this.canvasDrawLine(ctx, maxLineX, 90, maxLineX - 4, 90 + 14, '0, 125, 0, 0.8', 1);
        // Draw line.
        this.canvasDrawLine(ctx, 86, 0, 86, ctx.canvas.height, '0, 125, 0, 0.4', 1);
      }
    }
  }

  drawPlay4(canvasSelector = '') {
    // eslint-disable-next-line
    const canvas = document.querySelector(canvasSelector);
    if ( canvas ) {
      const ctx = canvas.getContext('2d');
      if ( ctx ) {
        const maxLineX = (ctx.canvas.width - 60);
        const maxArrowX = (ctx.canvas.width - 70);
        // Clear.
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.fillStyle = 'rgb(235, 235, 235)';
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        // A.
        this.canvasDrawText(ctx, 'A', 50, 28, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // A line.
        this.canvasDrawLine(ctx, 64, 20, maxLineX, 20, '125, 0, 0, 0.8', 1);
        this.canvasDrawLine(ctx, maxLineX, 20, maxArrowX, 14, '125, 0, 0, 0.8', 1);
        this.canvasDrawLine(ctx, maxLineX, 20, maxArrowX, 26, '125, 0, 0, 0.8', 1);
        // B.
        this.canvasDrawText(ctx, 'B', 60, 58, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // B Line.
        this.canvasDrawLine(ctx, 74, 50, maxLineX, 50, '0, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, maxLineX, 50, maxArrowX, 44, '0, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, maxLineX, 50, maxArrowX, 56, '0, 0, 125, 0.8', 1);
        // X.
        this.canvasDrawText(ctx, 'X', 40, 82, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // Draw ball.
        this.canvasDrawBall(ctx, 32, 67);
        // C.
        this.canvasDrawText(ctx, 'C', 60, 106, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // C line.
        this.canvasDrawLine(ctx, 74, 98, maxLineX, 98, '125, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, maxLineX, 98, maxArrowX, 92, '125, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, maxLineX, 98, maxArrowX, 104, '125, 0, 125, 0.8', 1);
        // D.
        this.canvasDrawText(ctx, 'D', 50, 136, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // D line.
        this.canvasDrawLine(ctx, 64, 132, maxLineX, 132, '0, 125, 0, 0.8', 1);
        this.canvasDrawLine(ctx, maxLineX, 132, maxArrowX, 126, '0, 125, 0, 0.8', 1);
        this.canvasDrawLine(ctx, maxLineX, 132, maxArrowX, 138, '0, 125, 0, 0.8', 1);
        // Draw.
        this.canvasDrawLine(ctx, 86, 0, 86, ctx.canvas.height, '0, 125, 0, 0.4', 1);
      }
    }
  }

  drawPlay5(canvasSelector = '') {
    // eslint-disable-next-line
    const canvas = document.querySelector(canvasSelector);
    if ( canvas ) {
      const ctx = canvas.getContext('2d');
      if ( ctx ) {
        const maxLineX = (ctx.canvas.width - 60);
        const arrowY = 6;
        // Clear.
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.fillStyle = 'rgb(235, 235, 235)';
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        // A.
        this.canvasDrawText(ctx, 'A', 65, 28, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // A line.
        this.canvasDrawLine(ctx, 79, 20, maxLineX, 20, '125, 0, 0, 0.8', 1);
        this.canvasDrawLine(ctx, maxLineX, 20, maxLineX - 10, 20 - arrowY, '125, 0, 0, 0.8', 1);
        this.canvasDrawLine(ctx, maxLineX, 20, maxLineX - 10, 20 + arrowY, '125, 0, 0, 0.8', 1);
        // this.canvasDrawLine(ctx, maxLineX, 104, maxLineX + arrowXVert, 104 - arrowYVert, '125, 0, 0, 0.8', 1);
        // B.
        this.canvasDrawText(ctx, 'B', 41, 104, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // B Line.
        this.canvasDrawLine(ctx, 55, 96, 105, 96, '0, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, 105, 96, 145, 128, '0, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, 145, 128, maxLineX, 128, '0, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, maxLineX, 128, maxLineX - 10, 128 - arrowY, '0, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, maxLineX, 128, maxLineX - 10, 128 + arrowY, '0, 0, 125, 0.8', 1);
        // X.
        this.canvasDrawText(ctx, 'X', 40, 82, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // Draw ball.
        this.canvasDrawBall(ctx, 32, 67);
        // C.
        this.canvasDrawText(ctx, 'C', 65, 118, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // C line.
        this.canvasDrawLine(ctx, 79, 110, 100, 110, '125, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, 100, 110, 132, 72, '125, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, 132, 72, maxLineX, 72, '125, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, maxLineX, 72, maxLineX - 10, 72 - arrowY, '125, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, maxLineX, 72, maxLineX - 10, 72 + arrowY, '125, 0, 125, 0.8', 1);
        // D.
        this.canvasDrawText(ctx, 'D', 65, 140, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // D line.
        this.canvasDrawLine(ctx, 79, 132, 115, 132, '0, 125, 0, 0.8', 1);
        this.canvasDrawLine(ctx, 115, 132, 150, 96, '0, 125, 0, 0.8', 1);
        this.canvasDrawLine(ctx, 150, 96, maxLineX, 96, '0, 125, 0, 0.8', 1);
        this.canvasDrawLine(ctx, maxLineX, 96, maxLineX - 10, 96 - arrowY, '0, 125, 0, 0.8', 1);
        this.canvasDrawLine(ctx, maxLineX, 96, maxLineX - 10, 96 + arrowY, '0, 125, 0, 0.8', 1);
        // Draw.
        this.canvasDrawLine(ctx, 86, 0, 86, ctx.canvas.height, '0, 125, 0, 0.4', 1);
      }
    }
  }

  drawPlay6(canvasSelector = '') {
    // eslint-disable-next-line
    const canvas = document.querySelector(canvasSelector);
    if ( canvas ) {
      const ctx = canvas.getContext('2d');
      if ( ctx ) {
        const maxLineX = (ctx.canvas.width - 60);
        // Clear.
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.fillStyle = 'rgb(235, 235, 235)';
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        // A.
        this.canvasDrawText(ctx, 'A', 41, 28, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // A line.
        this.canvasDrawLine(ctx, 55, 20, 175, 20, '125, 0, 0, 0.8', 1);
        this.canvasDrawLine(ctx, 175, 20, 145, 95, '125, 0, 0, 0.8', 1);
        this.canvasDrawLine(ctx, 145, 95, 140, 85, '125, 0, 0, 0.8', 1);
        this.canvasDrawLine(ctx, 145, 95, 156, 88, '125, 0, 0, 0.8', 1);
        // B.
        this.canvasDrawText(ctx, 'B', 60, 58, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // B Line.
        this.canvasDrawLine(ctx, 74, 50, 215, 50, '0, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, 215, 50, 185, 20, '0, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, 185, 20, 185, 32, '0, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, 185, 20, 197, 22, '0, 0, 125, 0.8', 1);
        // X.
        this.canvasDrawText(ctx, 'X', 40, 82, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // Draw ball.
        this.canvasDrawBall(ctx, 32, 67);
        // C.
        this.canvasDrawText(ctx, 'C', 60, 106, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // C line.
        this.canvasDrawLine(ctx, 74, 98, 185, 98, '125, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, 185, 98, 155, 128, '125, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, 155, 128, 157, 116, '125, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, 155, 128, 168, 124, '125, 0, 125, 0.8', 1);
        // D.
        this.canvasDrawText(ctx, 'D', 41, 136, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // D line.
        this.canvasDrawLine(ctx, 55, 132, 170, 132, '0, 125, 0, 0.8', 1);
        this.canvasDrawLine(ctx, 170, 132, 200, 84, '0, 125, 0, 0.8', 1);
        this.canvasDrawLine(ctx, 200, 84, maxLineX, 84, '0, 125, 0, 0.8', 1);
        this.canvasDrawLine(ctx, maxLineX, 84, maxLineX - 10, 78, '0, 125, 0, 0.8', 1);
        this.canvasDrawLine(ctx, maxLineX, 84, maxLineX - 10, 90, '0, 125, 0, 0.8', 1);
        // Draw.
        this.canvasDrawLine(ctx, 86, 0, 86, ctx.canvas.height, '0, 125, 0, 0.4', 1);
      }
    }
  }

  drawPlay7(canvasSelector = '') {
    // eslint-disable-next-line
    const canvas = document.querySelector(canvasSelector);
    if ( canvas ) {
      const ctx = canvas.getContext('2d');
      if ( ctx ) {
        const maxLineX = (ctx.canvas.width - 60);
        const arrowY = 6;
        // Clear.
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.fillStyle = 'rgb(235, 235, 235)';
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        // A.
        this.canvasDrawText(ctx, 'A', 65, 38, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // A line.
        this.canvasDrawLine(ctx, 79, 30, 105, 30, '125, 0, 0, 0.8', 1);
        this.canvasDrawLine(ctx, 105, 30, 185, 130, '125, 0, 0, 0.8', 1);
        this.canvasDrawLine(ctx, 185, 130, maxLineX, 130, '125, 0, 0, 0.8', 1);
        this.canvasDrawLine(ctx, maxLineX, 130, maxLineX - 10, 130 - arrowY, '125, 0, 0, 0.8', 1);
        this.canvasDrawLine(ctx, maxLineX, 130, maxLineX - 10, 130 + arrowY, '125, 0, 0, 0.8', 1);
        // B.
        this.canvasDrawText(ctx, 'B', 41, 60, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // B Line.
        this.canvasDrawLine(ctx, 55, 52, 185, 52, '0, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, 185, 52, 155, 82, '0, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, 155, 82, 156, 71, '0, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, 155, 82, 166, 80, '0, 0, 125, 0.8', 1);
        // X.
        this.canvasDrawText(ctx, 'X', 40, 82, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // Draw ball.
        this.canvasDrawBall(ctx, 32, 67);
        // C.
        this.canvasDrawText(ctx, 'C', 41, 104, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // C line.
        this.canvasDrawLine(ctx, 55, 96, 140, 96, '125, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, 140, 96, 110, 126, '125, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, 110, 126, 111, 115, '125, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, 110, 126, 121, 124, '125, 0, 125, 0.8', 1);
        // D.
        this.canvasDrawText(ctx, 'D', 65, 130, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // D line.
        this.canvasDrawLine(ctx, 79, 122, 135, 122, '0, 125, 0, 0.8', 1);
        this.canvasDrawLine(ctx, 135, 122, 215, 38, '0, 125, 0, 0.8', 1);
        this.canvasDrawLine(ctx, 215, 38, maxLineX, 38, '0, 125, 0, 0.8', 1);
        this.canvasDrawLine(ctx, maxLineX, 38, maxLineX - 10, 38 - 6, '0, 125, 0, 0.8', 1);
        this.canvasDrawLine(ctx, maxLineX, 38, maxLineX - 10, 38 + 6, '0, 125, 0, 0.8', 1);
        // Draw.
        this.canvasDrawLine(ctx, 86, 0, 86, ctx.canvas.height, '0, 125, 0, 0.4', 1);
      }
    }
  }

  drawPlay8(canvasSelector = '') {
    // eslint-disable-next-line
    const canvas = document.querySelector(canvasSelector);
    if ( canvas ) {
      const ctx = canvas.getContext('2d');
      if ( ctx ) {
        const maxLineX = (ctx.canvas.width - 60);
        const arrowY = 6;
        // Clear.
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.fillStyle = 'rgb(235, 235, 235)';
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        // A.
        this.canvasDrawText(ctx, 'A', 65, 38, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // A line.
        this.canvasDrawLine(ctx, 79, 31, 93, 50, '125, 0, 0, 0.8', 1);
        this.canvasDrawLine(ctx, 93, 50, 113, 50, '125, 0, 0, 0.8', 1);
        this.canvasDrawLine(ctx, 113 - 4, 50 - arrowY, 113 + 4, 50 + arrowY, '125, 0, 0, 0.8', 1);
        this.canvasDrawLine(ctx, 113 - 4, 50 + arrowY, 113 + 4, 50 - arrowY, '125, 0, 0, 0.8', 1);
        // B.
        this.canvasDrawText(ctx, 'B', 65, 60, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // B line.
        this.canvasDrawLine(ctx, 79, 53, 110, 74, '0, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, 110, 74, 130, 74, '0, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, 130 - 4, 74 - arrowY, 130 + 4, 74 + arrowY, '0, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, 130 - 4, 74 + arrowY, 130 + 4, 74 - arrowY, '0, 0, 125, 0.8', 1);
        // X.
        this.canvasDrawText(ctx, 'X', 40, 82, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // X line.
        this.canvasDrawLine(ctx, 54, 74, 80, 74, '50, 50, 50, 0.8', 1);
        this.canvasDrawLine(ctx, 80, 74, 100, 84, '50, 50, 50, 0.8', 1);
        this.canvasDrawLine(ctx, 100, 84, 110, 84, '50, 50, 50, 0.8', 1);
        this.canvasDrawLine(ctx, 110, 84, 110 - 10, 84 - arrowY, '50, 50, 50, 0.8', 1);
        this.canvasDrawLine(ctx, 110, 84, 110 - 10, 84 + arrowY, '50, 50, 50, 0.8', 1);
        // Draw ball.
        this.canvasDrawBall(ctx, 32, 67);
        // C.
        this.canvasDrawText(ctx, 'C', 65, 104, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // C line.
        this.canvasDrawLine(ctx, 79, 96, 90, 96, '125, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, 90, 96, 115, 108, '125, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, 115 - 4, 108 - arrowY, 115 + 4, 108 + arrowY, '125, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, 115 - 4, 108 + arrowY, 115 + 4, 108 - arrowY, '125, 0, 125, 0.8', 1);
        // D.
        this.canvasDrawText(ctx, 'D', 41, 130, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // D line.
        this.canvasDrawLine(ctx, 55, 122, maxLineX, 122, '0, 125, 0, 0.8', 1);
        this.canvasDrawLine(ctx, maxLineX, 122, maxLineX - 10, 122 - arrowY, '0, 125, 0, 0.8', 1);
        this.canvasDrawLine(ctx, maxLineX, 122, maxLineX - 10, 122 + arrowY, '0, 125, 0, 0.8', 1);
        // Draw.
        this.canvasDrawLine(ctx, 86, 0, 86, ctx.canvas.height, '0, 125, 0, 0.4', 1);
      }
    }
  }

  drawPlay9(canvasSelector = '') {
    // eslint-disable-next-line
    const canvas = document.querySelector(canvasSelector);
    if ( canvas ) {
      const ctx = canvas.getContext('2d');
      if ( ctx ) {
        const arrowY = 6;
        // Clear.
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.fillStyle = 'rgb(235, 235, 235)';
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        // A.
        this.canvasDrawText(ctx, 'A', 60, 48, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // A line.
        this.canvasDrawLine(ctx, 74, 40, 85, 40, '125, 0, 0, 0.8', 1);
        this.canvasDrawLine(ctx, 85, 40, 100, 20, '125, 0, 0, 0.8', 1);
        this.canvasDrawLine(ctx, 100, 20, 110, 20, '125, 0, 0, 0.8', 1);
        this.canvasDrawLine(ctx, 110 - 4, 20 - arrowY, 110 + 4, 20 + arrowY, '125, 0, 0, 0.8', 1);
        this.canvasDrawLine(ctx, 110 - 4, 20 + arrowY, 110 + 4, 20 - arrowY, '125, 0, 0, 0.8', 1);
        // B.
        this.canvasDrawText(ctx, 'B', 65, 70, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // B line.
        this.canvasDrawLine(ctx, 79, 62, 90, 62, '0, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, 90, 62, 115, 42, '0, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, 115, 42, 120, 42, '0, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, 120 - 4, 42 - arrowY, 120 + 4, 42 + arrowY, '0, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, 120 - 4, 42 + arrowY, 120 + 4, 42 - arrowY, '0, 0, 125, 0.8', 1);
        // X.
        this.canvasDrawText(ctx, 'X', 40, 82, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // X line.
        this.canvasDrawLine(ctx, 48, 64, 60, 50, '50, 50, 50, 0.8', 1);
        this.canvasDrawLine(ctx, 60, 50, 90, 50, '50, 50, 50, 0.8', 1);
        this.canvasDrawLine(ctx, 90, 50, 100, 40, '50, 50, 50, 0.8', 1);
        this.canvasDrawLine(ctx, 100, 40, 91, 41, '50, 50, 50, 0.8', 1);
        this.canvasDrawLine(ctx, 100, 40, 99, 49, '50, 50, 50, 0.8', 1);
        // Draw ball.
        this.canvasDrawBall(ctx, 32, 67);
        // C.
        this.canvasDrawText(ctx, 'C', 65, 94, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // C line.
        this.canvasDrawLine(ctx, 79, 86, 88, 86, '125, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, 88, 86, 106, 76, '125, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, 106, 76, 110, 76, '125, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, 110 - 4, 76 - arrowY, 110 + 4, 76 + arrowY, '125, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, 110 - 4, 76 + arrowY, 110 + 4, 76 - arrowY, '125, 0, 125, 0.8', 1);
        // D.
        this.canvasDrawText(ctx, 'D', 40, 104, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // D line.
        this.canvasDrawLine(ctx, 50, 88, 64, 74, '0, 125, 0, 0.8', 1);
        this.canvasDrawLine(ctx, 64, 74, 84, 74, '0, 125, 0, 0.8', 1);
        this.canvasDrawLine(ctx, 84 - 4, 74 - arrowY, 84 + 4, 74 + arrowY, '0, 125, 0, 0.8', 1);
        this.canvasDrawLine(ctx, 84 - 4, 74 + arrowY, 84 + 4, 74 - arrowY, '0, 125, 0, 0.8', 1);
        // Draw.
        this.canvasDrawLine(ctx, 86, 0, 86, ctx.canvas.height, '0, 125, 0, 0.4', 1);
      }
    }
  }

  drawPlay10(canvasSelector = '') {
    // eslint-disable-next-line
    const canvas = document.querySelector(canvasSelector);
    if ( canvas ) {
      const ctx = canvas.getContext('2d');
      if ( ctx ) {
        const arrowY = 6;
        // Clear.
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.fillStyle = 'rgb(235, 235, 235)';
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        // A.
        this.canvasDrawText(ctx, 'A', 45, 118, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // A line.
        this.canvasDrawLine(ctx, 53, 112, 65, 123, '125, 0, 0, 0.8', 1);
        this.canvasDrawLine(ctx, 65, 123, 125, 123, '125, 0, 0, 0.8', 1);
        this.canvasDrawLine(ctx, 125 - 4, 123 - arrowY, 125 + 4, 123 + arrowY, '125, 0, 0, 0.8', 1);
        this.canvasDrawLine(ctx, 125 - 4, 123 + arrowY, 125 + 4, 123 - arrowY, '125, 0, 0, 0.8', 1);
        // B.
        this.canvasDrawText(ctx, 'B', 65, 96, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // B line.
        this.canvasDrawLine(ctx, 79, 88, 85, 94, '0, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, 85, 94, 105, 94, '0, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, 105 - 4, 94 - arrowY, 105 + 4, 94 + arrowY, '0, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, 105 - 4, 94 + arrowY, 105 + 4, 94 - arrowY, '0, 0, 125, 0.8', 1);
        // X.
        this.canvasDrawText(ctx, 'X', 40, 82, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // X line.
        this.canvasDrawLine(ctx, 44, 86, 54, 100, '50, 50, 50, 0.8', 1);
        this.canvasDrawLine(ctx, 54, 100, 46, 98, '50, 50, 50, 0.8', 1);
        this.canvasDrawLine(ctx, 54, 100, 55, 91, '50, 50, 50, 0.8', 1);
        // Draw ball.
        this.canvasDrawBall(ctx, 32, 67);
        // C.
        this.canvasDrawText(ctx, 'C', 65, 118, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // C line.
        this.canvasDrawLine(ctx, 79, 110, 115, 110, '125, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, 115 - 4, 110 - arrowY, 115 + 4, 110 + arrowY, '125, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, 115 - 4, 110 + arrowY, 115 + 4, 110 - arrowY, '125, 0, 125, 0.8', 1);
        // D.
        this.canvasDrawText(ctx, 'D', 65, 140, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // D line.
        this.canvasDrawLine(ctx, 79, 132, 140, 132, '0, 125, 0, 0.8', 1);
        this.canvasDrawLine(ctx, 140 - 4, 132 - arrowY, 140 + 4, 132 + arrowY, '0, 125, 0, 0.8', 1);
        this.canvasDrawLine(ctx, 140 - 4, 132 + arrowY, 140 + 4, 132 - arrowY, '0, 125, 0, 0.8', 1);
        // Draw.
        this.canvasDrawLine(ctx, 86, 0, 86, ctx.canvas.height, '0, 125, 0, 0.4', 1);
      }
    }
  }

  drawPlay11(canvasSelector = '') {
    // eslint-disable-next-line
    const canvas = document.querySelector(canvasSelector);
    if ( canvas ) {
      const ctx = canvas.getContext('2d');
      if ( ctx ) {
        const arrowY = 6;
        // Clear.
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.fillStyle = 'rgb(235, 235, 235)';
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        // A.
        this.canvasDrawText(ctx, 'A', 65, 38, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // A line.
        this.canvasDrawLine(ctx, 79, 31, 155, 31, '125, 0, 0, 0.8', 1);
        this.canvasDrawLine(ctx, 151, 31 - arrowY, 159, 31 + arrowY, '125, 0, 0, 0.8', 1);
        this.canvasDrawLine(ctx, 159, 31 - arrowY, 151, 31 + arrowY, '125, 0, 0, 0.8', 1);
        // B.
        this.canvasDrawText(ctx, 'B', 65, 60, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // B line.
        this.canvasDrawLine(ctx, 79, 52, 135, 52, '0, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, 131, 52 - arrowY, 139, 52 + arrowY, '0, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, 139, 52 - arrowY, 131, 52 + arrowY, '0, 0, 125, 0.8', 1);
        // X.
        this.canvasDrawText(ctx, 'X', 40, 82, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // X line.
        this.canvasDrawLine(ctx, 48, 64, 60, 40, '50, 50, 50, 0.8', 1);
        this.canvasDrawLine(ctx, 60, 40, 100, 40, '50, 50, 50, 0.8', 1);
        this.canvasDrawLine(ctx, 100, 40, 90, 40 - arrowY, '50, 50, 50, 0.8', 1);
        this.canvasDrawLine(ctx, 100, 40, 90, 40 + arrowY, '50, 50, 50, 0.8', 1);
        // Draw ball.
        this.canvasDrawBall(ctx, 32, 67);
        // C.
        this.canvasDrawText(ctx, 'C', 65, 94, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // C line.
        this.canvasDrawLine(ctx, 79, 86, 90, 86, '125, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, 90, 86, 105, 70, '125, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, 105, 70, 115, 70, '125, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, 111, 70 - arrowY, 119, 70 + arrowY, '125, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, 119, 70 - arrowY, 111, 70 + arrowY, '125, 0, 125, 0.8', 1);
        // D.
        this.canvasDrawText(ctx, 'D', 41, 108, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // D line.
        this.canvasDrawLine(ctx, 55, 100, 75, 100, '0, 125, 0, 0.8', 1);
        this.canvasDrawLine(ctx, 75, 100, 115, 40, '0, 125, 0, 0.8', 1);
        this.canvasDrawLine(ctx, 115, 40, 135, 40, '0, 125, 0, 0.8', 1);
        this.canvasDrawLine(ctx, 135, 40, 125, 40 - arrowY, '0, 125, 0, 0.8', 1);
        this.canvasDrawLine(ctx, 135, 40, 125, 40 + arrowY, '0, 125, 0, 0.8', 1);
        // Draw.
        this.canvasDrawLine(ctx, 86, 0, 86, ctx.canvas.height, '0, 125, 0, 0.4', 1);
      }
    }
  }

  drawPlay12(canvasSelector = '') {
    // eslint-disable-next-line
    const canvas = document.querySelector(canvasSelector);
    if ( canvas ) {
      const ctx = canvas.getContext('2d');
      if ( ctx ) {
        const maxLineX = (ctx.canvas.width - 60);
        const arrowY = 6;
        // Clear.
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.fillStyle = 'rgb(235, 235, 235)';
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        // A.
        this.canvasDrawText(ctx, 'A', 40, 42, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // A line.
        this.canvasDrawLine(ctx, 60, 34, 80, 34, '125, 0, 0, 0.8', 1);
        this.canvasDrawLine(ctx, 80, 34, 160, 136, '125, 0, 0, 0.8', 1);
        this.canvasDrawLine(ctx, 160, 136, maxLineX, 136, '125, 0, 0, 0.8', 1);
        this.canvasDrawLine(ctx, maxLineX, 136, maxLineX - 10, 136 - arrowY, '125, 0, 0, 0.8', 1);
        this.canvasDrawLine(ctx, maxLineX, 136, maxLineX - 10, 136 + arrowY, '125, 0, 0, 0.8', 1);
        // B.
        this.canvasDrawText(ctx, 'B', 40, 136, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // B line.
        this.canvasDrawLine(ctx, 54, 128, 125, 128, '0, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, 125, 128, 195, 32, '0, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, 195, 32, maxLineX - 10, 32, '0, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, maxLineX - 10, 32, maxLineX - 20, 32 - arrowY, '0, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, maxLineX - 10, 32, maxLineX - 20, 32 + arrowY, '0, 0, 125, 0.8', 1);
        // X.
        this.canvasDrawText(ctx, 'X', 40, 82, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // X line.
        this.canvasDrawLine(ctx, 54, 74, 70, 90, '50, 50, 50, 0.8', 1);
        this.canvasDrawLine(ctx, 70, 90, 90, 90, '50, 50, 50, 0.8', 1);
        this.canvasDrawLine(ctx, 90, 90, 90 - 10, 90 - arrowY, '50, 50, 50, 0.8', 1);
        this.canvasDrawLine(ctx, 90, 90, 90 - 10, 90 + arrowY, '50, 50, 50, 0.8', 1);
        // Draw ball.
        this.canvasDrawBall(ctx, 32, 67);
        // X1.
        this.canvasDrawText(ctx, 'X', 60, 62, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // X1 line.
        this.canvasDrawLine(ctx, 74, 56, 104, 86, '10, 10, 10, 0.9', 1);
        this.canvasDrawLine(ctx, 104, 86, 114, 86, '10, 10, 10, 0.9', 1);
        this.canvasDrawLine(ctx, 114, 86, 114, 86 - arrowY, '10, 10, 10, 0.9', 1);
        this.canvasDrawLine(ctx, 114, 86, 114, 86 + arrowY, '10, 10, 10, 0.9', 1);
        // X2.
        this.canvasDrawText(ctx, 'X', 65, 82, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // X2 line.
        this.canvasDrawLine(ctx, 79, 76, 109, 106, '10, 10, 10, 0.9', 1);
        this.canvasDrawLine(ctx, 109, 106, 124, 106, '10, 10, 10, 0.9', 1);
        this.canvasDrawLine(ctx, 124, 106, 124, 106 - arrowY, '10, 10, 10, 0.9', 1);
        this.canvasDrawLine(ctx, 124, 106, 124, 106 + arrowY, '10, 10, 10, 0.9', 1);
        // X3.
        this.canvasDrawText(ctx, 'X', 60, 102, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // X3 line.
        this.canvasDrawLine(ctx, 74, 96, 104, 116, '10, 10, 10, 0.9', 1);
        this.canvasDrawLine(ctx, 104, 116, 114, 116, '10, 10, 10, 0.9', 1);
        this.canvasDrawLine(ctx, 114, 116, 114, 116 - arrowY, '10, 10, 10, 0.9', 1);
        this.canvasDrawLine(ctx, 114, 116, 114, 116 + arrowY, '10, 10, 10, 0.9', 1);
        // X4.
        this.canvasDrawText(ctx, 'X', 55, 122, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // X4 line.
        this.canvasDrawLine(ctx, 69, 116, 94, 120, '10, 10, 10, 0.9', 1);
        this.canvasDrawLine(ctx, 94, 120, 104, 120, '10, 10, 10, 0.9', 1);
        this.canvasDrawLine(ctx, 104, 120, 104, 120 - arrowY, '10, 10, 10, 0.9', 1);
        this.canvasDrawLine(ctx, 104, 120, 104, 120 + arrowY, '10, 10, 10, 0.9', 1);
        // Draw.
        this.canvasDrawLine(ctx, 86, 0, 86, ctx.canvas.height, '0, 125, 0, 0.4', 1);
      }
    }
  }

  drawPlay13(canvasSelector = '') {
    // eslint-disable-next-line
    const canvas = document.querySelector(canvasSelector);
    if ( canvas ) {
      const ctx = canvas.getContext('2d');
      if ( ctx ) {
        const maxLineX = (ctx.canvas.width - 60);
        const arrowY = 6;
        // Clear.
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.fillStyle = 'rgb(235, 235, 235)';
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        // A.
        this.canvasDrawText(ctx, 'A', 30, 20, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // A line.
        this.canvasDrawLine(ctx, 40, 16, 50, 23, '125, 0, 0, 0.8', 1);
        this.canvasDrawLine(ctx, 50, 23, 100, 23, '125, 0, 0, 0.8', 1);
        this.canvasDrawLine(ctx, 100, 23, 100, 23 - arrowY, '125, 0, 0, 0.8', 1);
        this.canvasDrawLine(ctx, 100, 23, 100, 23 + arrowY, '125, 0, 0, 0.8', 1);
        // B.
        this.canvasDrawText(ctx, 'B', 60, 102, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // B line.
        this.canvasDrawLine(ctx, 74, 96, 105, 96, '0, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, 105, 96, 155, 20, '0, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, 155, 20, maxLineX, 20, '0, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, maxLineX, 20, maxLineX - 10, 20 - arrowY, '0, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, maxLineX, 20, maxLineX - 10, 20 + arrowY, '0, 0, 125, 0.8', 1);
        // X.
        this.canvasDrawText(ctx, 'X', 40, 82, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // Draw ball.
        this.canvasDrawBall(ctx, 32, 67);
        // X1.
        this.canvasDrawText(ctx, 'X', 60, 20, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // X1 line.
        this.canvasDrawLine(ctx, 74, 12, 124, 12, '10, 10, 10, 0.9', 1);
        this.canvasDrawLine(ctx, 124, 12, 124, 12 - arrowY, '10, 10, 10, 0.9', 1);
        this.canvasDrawLine(ctx, 124, 12, 124, 12 + arrowY, '10, 10, 10, 0.9', 1);
        // X2.
        this.canvasDrawText(ctx, 'X', 60, 40, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // X2 line.
        this.canvasDrawLine(ctx, 74, 32, 124, 32, '10, 10, 10, 0.9', 1);
        this.canvasDrawLine(ctx, 124, 32, 124, 32 - arrowY, '10, 10, 10, 0.9', 1);
        this.canvasDrawLine(ctx, 124, 32, 124, 32 + arrowY, '10, 10, 10, 0.9', 1);
        // X3.
        this.canvasDrawText(ctx, 'X', 60, 60, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // X3 line.
        this.canvasDrawLine(ctx, 74, 52, 114, 52, '10, 10, 10, 0.9', 1);
        this.canvasDrawLine(ctx, 114, 52, 114, 52 - arrowY, '10, 10, 10, 0.9', 1);
        this.canvasDrawLine(ctx, 114, 52, 114, 52 + arrowY, '10, 10, 10, 0.9', 1);
        // X4.
        this.canvasDrawText(ctx, 'X', 60, 82, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // X4 line.
        this.canvasDrawLine(ctx, 74, 74, 84, 64, '10, 10, 10, 0.9', 1);
        this.canvasDrawLine(ctx, 84, 64, 104, 64, '10, 10, 10, 0.9', 1);
        this.canvasDrawLine(ctx, 104, 64, 104, 64 - arrowY, '10, 10, 10, 0.9', 1);
        this.canvasDrawLine(ctx, 104, 64, 104, 64 + arrowY, '10, 10, 10, 0.9', 1);
        // Draw.
        this.canvasDrawLine(ctx, 86, 0, 86, ctx.canvas.height, '0, 125, 0, 0.4', 1);
      }
    }
  }

  drawPlay14(canvasSelector = '') {
    // eslint-disable-next-line
    const canvas = document.querySelector(canvasSelector);
    if ( canvas ) {
      const ctx = canvas.getContext('2d');
      if ( ctx ) {
        const maxLineX = (ctx.canvas.width - 60);
        const arrowY = 6;
        // Clear.
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.fillStyle = 'rgb(235, 235, 235)';
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        // A.
        this.canvasDrawText(ctx, 'A', 65, 82, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // A line.
        this.canvasDrawLine(ctx, 79, 74, 110, 74, '125, 0, 0, 0.8', 1);
        this.canvasDrawLine(ctx, 110, 74, 160, 106, '125, 0, 0, 0.8', 1);
        this.canvasDrawLine(ctx, 160, 106, maxLineX, 106, '125, 0, 0, 0.8', 1);
        this.canvasDrawLine(ctx, maxLineX, 106, maxLineX - 10, 106 - arrowY, '125, 0, 0, 0.8', 1);
        this.canvasDrawLine(ctx, maxLineX, 106, maxLineX - 10, 106 + arrowY, '125, 0, 0, 0.8', 1);
        // B.
        this.canvasDrawText(ctx, 'B', 40, 102, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // B line.
        this.canvasDrawLine(ctx, 48, 94, 60, 106, '0, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, 60, 106, 120, 106, '0, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, 120, 106, 120 - 10, 106 - arrowY, '0, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, 120, 106, 120 - 10, 106 + arrowY, '0, 0, 125, 0.8', 1);
        // X.
        this.canvasDrawText(ctx, 'X', 40, 82, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // X line.
        this.canvasDrawLine(ctx, 54, 74, 70, 90, '50, 50, 50, 0.8', 1);
        this.canvasDrawLine(ctx, 70, 90, 90, 90, '50, 50, 50, 0.8', 1);
        this.canvasDrawLine(ctx, 90, 90, 90 - 10, 90 - arrowY, '50, 50, 50, 0.8', 1);
        this.canvasDrawLine(ctx, 90, 90, 90 - 10, 90 + arrowY, '50, 50, 50, 0.8', 1);
        // Draw ball.
        this.canvasDrawBall(ctx, 32, 67);
        // X1.
        this.canvasDrawText(ctx, 'X', 55, 42, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // X1 line.
        this.canvasDrawLine(ctx, 69, 34, 90, 34, '10, 10, 10, 0.9', 1);
        this.canvasDrawLine(ctx, 90, 34, 120, 54, '10, 10, 10, 0.9', 1);
        this.canvasDrawLine(ctx, 120, 54, 130, 54, '10, 10, 10, 0.9', 1);
        this.canvasDrawLine(ctx, 130, 54, 130, 54 - arrowY, '10, 10, 10, 0.9', 1);
        this.canvasDrawLine(ctx, 130, 54, 130, 54 + arrowY, '10, 10, 10, 0.9', 1);
        // X2.
        this.canvasDrawText(ctx, 'X', 60, 62, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // X2 line.
        this.canvasDrawLine(ctx, 74, 54, 90, 54, '10, 10, 10, 0.9', 1);
        this.canvasDrawLine(ctx, 90, 54, 120, 74, '10, 10, 10, 0.9', 1);
        this.canvasDrawLine(ctx, 120, 74, 130, 74, '10, 10, 10, 0.9', 1);
        this.canvasDrawLine(ctx, 130, 74, 130, 74 - arrowY, '10, 10, 10, 0.9', 1);
        this.canvasDrawLine(ctx, 130, 74, 130, 74 + arrowY, '10, 10, 10, 0.9', 1);
        // X3.
        this.canvasDrawText(ctx, 'X', 60, 102, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // X3 line.
        this.canvasDrawLine(ctx, 74, 96, 125, 96, '10, 10, 10, 0.9', 1);
        this.canvasDrawLine(ctx, 125, 96, 125, 96 - arrowY, '10, 10, 10, 0.9', 1);
        this.canvasDrawLine(ctx, 125, 96, 125, 96 + arrowY, '10, 10, 10, 0.9', 1);
        // X4.
        this.canvasDrawText(ctx, 'X', 55, 122, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // X4 line.
        this.canvasDrawLine(ctx, 69, 116, 84, 130, '10, 10, 10, 0.9', 1);
        this.canvasDrawLine(ctx, 84, 130, 130, 130, '10, 10, 10, 0.9', 1);
        this.canvasDrawLine(ctx, 130, 130, 130, 130 - arrowY, '10, 10, 10, 0.9', 1);
        this.canvasDrawLine(ctx, 130, 130, 130, 130 + arrowY, '10, 10, 10, 0.9', 1);
        // Draw.
        this.canvasDrawLine(ctx, 86, 0, 86, ctx.canvas.height, '0, 125, 0, 0.4', 1);
      }
    }
  }

  drawPlay15(canvasSelector = '') {
    // eslint-disable-next-line
    const canvas = document.querySelector(canvasSelector);
    if ( canvas ) {
      const ctx = canvas.getContext('2d');
      if ( ctx ) {
        const arrowY = 6;
        // Clear.
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.fillStyle = 'rgb(235, 235, 235)';
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        // A.
        this.canvasDrawText(ctx, 'A', 30, 132, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // A line.
        this.canvasDrawLine(ctx, 44, 124, 90, 124, '125, 0, 0, 0.8', 1);
        this.canvasDrawLine(ctx, 90 - 6, 124 - arrowY, 90 + 6, 124 + arrowY, '125, 0, 0, 0.8', 1);
        this.canvasDrawLine(ctx, 90 - 6, 124 + arrowY, 90 + 6, 124 - arrowY, '125, 0, 0, 0.8', 1);
        // B.
        this.canvasDrawText(ctx, 'B', 40, 112, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // B line.
        this.canvasDrawLine(ctx, 54, 106, 120, 106, '0, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, 120 - 6, 106 - arrowY, 120 + 6, 106 + arrowY, '0, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, 120 - 6, 106 + arrowY, 120 + 6, 106 - arrowY, '0, 0, 125, 0.8', 1);
        // C.
        this.canvasDrawText(ctx, 'C', 60, 32, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // C line.
        this.canvasDrawLine(ctx, 74, 32, 100, 32, '125, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, 100, 32, 150, 80, '125, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, 150, 80, 160, 80, '125, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, 160 - 6, 80 - arrowY, 160 + 6, 80 + arrowY, '125, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, 160 - 6, 80 + arrowY, 160 + 6, 80 - arrowY, '125, 0, 125, 0.8', 1);
        // X.
        this.canvasDrawText(ctx, 'X', 40, 82, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // X line.
        // Draw ball.
        this.canvasDrawBall(ctx, 32, 67);
        // X1.
        this.canvasDrawText(ctx, 'X', 60, 62, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // X1 line.
        this.canvasDrawLine(ctx, 74, 54, 100, 54, '10, 10, 10, 0.9', 1);
        this.canvasDrawLine(ctx, 100 - 6, 54 - arrowY, 100 + 6, 54 + arrowY, '10, 10, 10, 0.9', 1);
        this.canvasDrawLine(ctx, 100 - 6, 54 + arrowY, 100 + 6, 54 - arrowY, '10, 10, 10, 0.9', 1);
        // X2.
        this.canvasDrawText(ctx, 'X', 60, 82, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // X2 line.
        this.canvasDrawLine(ctx, 74, 74, 120, 74, '10, 10, 10, 0.9', 1);
        this.canvasDrawLine(ctx, 120 - 6, 74 - arrowY, 120 + 6, 74 + arrowY, '10, 10, 10, 0.9', 1);
        this.canvasDrawLine(ctx, 120 - 6, 74 + arrowY, 120 + 6, 74 - arrowY, '10, 10, 10, 0.9', 1);
        // X3.
        this.canvasDrawText(ctx, 'X', 60, 102, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // X3 line.
        this.canvasDrawLine(ctx, 74, 94, 100, 94, '10, 10, 10, 0.9', 1);
        this.canvasDrawLine(ctx, 100 - 6, 94 - arrowY, 100 + 6, 94 + arrowY, '10, 10, 10, 0.9', 1);
        this.canvasDrawLine(ctx, 100 - 6, 94 + arrowY, 100 + 6, 94 - arrowY, '10, 10, 10, 0.9', 1);
        // X4.
        this.canvasDrawText(ctx, 'X', 60, 142, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // X4 line.
        this.canvasDrawLine(ctx, 74, 134, 140, 134, '10, 10, 10, 0.9', 1);
        this.canvasDrawLine(ctx, 140 - 6, 134 - arrowY, 140 + 6, 134 + arrowY, '10, 10, 10, 0.9', 1);
        this.canvasDrawLine(ctx, 140 - 6, 134 + arrowY, 140 + 6, 134 - arrowY, '10, 10, 10, 0.9', 1);
        // Draw.
        this.canvasDrawLine(ctx, 86, 0, 86, ctx.canvas.height, '0, 125, 0, 0.4', 1);
      }
    }
  }

  drawPlay16(canvasSelector = '') {
    // eslint-disable-next-line
    const canvas = document.querySelector(canvasSelector);
    if ( canvas ) {
      const ctx = canvas.getContext('2d');
      if ( ctx ) {
        const maxLineX = (ctx.canvas.width - 60);
        const maxArrowX = (ctx.canvas.width - 70);
        // Clear.
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.fillStyle = 'rgb(235, 235, 235)';
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        // A.
        this.canvasDrawText(ctx, 'A', 50, 28, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // A line.
        this.canvasDrawLine(ctx, 64, 20, 124, 20, '125, 0, 0, 0.8', 1);
        this.canvasDrawLine(ctx, 124, 20, 195, 106, '125, 0, 0, 0.8', 1);
        this.canvasDrawLine(ctx, 195, 106, maxLineX, 106, '125, 0, 0, 0.8', 1);

        this.canvasDrawLine(ctx, maxLineX, 106, maxLineX - 13, 106 - 6, '125, 0, 0, 0.8', 1);
        this.canvasDrawLine(ctx, maxLineX, 106, maxLineX - 13, 106 + 6, '125, 0, 0, 0.8', 1);
        // B.
        this.canvasDrawText(ctx, 'B', 60, 58, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // B Line.
        this.canvasDrawLine(ctx, 74, 50, 104, 50, '0, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, 104, 50, 164, 128, '0, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, 164, 128, maxLineX, 128, '0, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, maxLineX, 128, maxArrowX, 122, '0, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, maxLineX, 128, maxArrowX, 134, '0, 0, 125, 0.8', 1);
        // X.
        this.canvasDrawText(ctx, 'X', 40, 82, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // Draw ball.
        this.canvasDrawBall(ctx, 32, 67);
        // C.
        this.canvasDrawText(ctx, 'C', 60, 106, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // C line.
        this.canvasDrawLine(ctx, 74, 98, 94, 98, '125, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, 94, 98, 168, 20, '125, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, 168, 20, maxLineX, 20, '125, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, maxLineX, 20, maxArrowX, 14, '125, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, maxLineX, 20, maxArrowX, 26, '125, 0, 125, 0.8', 1);
        // D.
        this.canvasDrawText(ctx, 'D', 50, 136, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // D line.
        this.canvasDrawLine(ctx, 64, 132, 108, 132, '0, 125, 0, 0.8', 1);
        this.canvasDrawLine(ctx, 108, 132, 195, 42, '0, 125, 0, 0.8', 1);
        this.canvasDrawLine(ctx, 195, 42, maxLineX, 42, '0, 125, 0, 0.8', 1);

        this.canvasDrawLine(ctx, maxLineX, 42, maxLineX - 13, 42 - 6, '0, 125, 0, 0.8', 1);
        this.canvasDrawLine(ctx, maxLineX, 42, maxLineX - 13, 42 + 6, '0, 125, 0, 0.8', 1);
        // Draw.
        this.canvasDrawLine(ctx, 86, 0, 86, ctx.canvas.height, '0, 125, 0, 0.4', 1);
      }
    }
  }

  drawPlay17(canvasSelector = '') {
    // eslint-disable-next-line
    const canvas = document.querySelector(canvasSelector);
    if ( canvas ) {
      const ctx = canvas.getContext('2d');
      if ( ctx ) {
        const maxLineX = (ctx.canvas.width - 60);
        const arrowX = 10;
        const arrowY = 6;
        // const arrowXVert = 7;
        // const arrowYVert = 8;
        const maxArrowX = (ctx.canvas.width - 70);
        // Clear.
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.fillStyle = 'rgb(235, 235, 235)';
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        // A.
        this.canvasDrawText(ctx, 'A', 50, 42, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // A line.
        this.canvasDrawLine(ctx, 60, 34, 80, 34, '125, 0, 0, 0.8', 1);
        this.canvasDrawLine(ctx, 80, 34, 160, 136, '125, 0, 0, 0.8', 1);
        this.canvasDrawLine(ctx, 160, 136, maxLineX, 136, '125, 0, 0, 0.8', 1);
        this.canvasDrawLine(ctx, maxLineX, 136, maxLineX, 136 - arrowY, '125, 0, 0, 0.8', 1);
        this.canvasDrawLine(ctx, maxLineX, 136, maxLineX, 136 + arrowY, '125, 0, 0, 0.8', 1);
        // B.
        this.canvasDrawText(ctx, 'B', 65, 122, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // B Line.
        this.canvasDrawLine(ctx, 79, 114, 140, 114, '0, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, 140, 114, 196, 40, '0, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, 196, 40, maxLineX, 40, '0, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, maxLineX, 40, maxLineX - arrowX, 40 - arrowY, '0, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, maxLineX, 40, maxLineX - arrowX, 40 + arrowY, '0, 0, 125, 0.8', 1);
        // X.
        this.canvasDrawText(ctx, 'X', 40, 82, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // Draw ball.
        this.canvasDrawBall(ctx, 32, 67);

        // C.
        this.canvasDrawText(ctx, 'C', 50, 106, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // C line.
        this.canvasDrawLine(ctx, 78, 100, 104, 100, '125, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, 104, 100, 168, 20, '125, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, 168, 20, maxLineX, 20, '125, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, maxLineX, 20, maxArrowX, 14, '125, 0, 125, 0.8', 1);
        this.canvasDrawLine(ctx, maxLineX, 20, maxArrowX, 26, '125, 0, 125, 0.8', 1);
        // D.
        this.canvasDrawText(ctx, 'D', 50, 136, 'bold 20px Tahoma, Geneva, sans-serif', '30, 30, 30, 0.8', 'center');
        // D line.
        this.canvasDrawLine(ctx, 68, 130, 168, 130, '0, 125, 0, 0.8', 1);
        this.canvasDrawLine(ctx, 168, 130, maxLineX - 20, 60, '0, 125, 0, 0.8', 1);
        this.canvasDrawLine(ctx, maxLineX - 20, 60, maxLineX, 60, '0, 125, 0, 0.8', 1);
        this.canvasDrawLine(ctx, maxLineX, 60, maxArrowX, 54, '0, 125, 0, 0.8', 1);
        this.canvasDrawLine(ctx, maxLineX, 60, maxArrowX, 66, '0, 125, 0, 0.8', 1);
        // Draw.
        this.canvasDrawLine(ctx, 86, 0, 86, ctx.canvas.height, '0, 125, 0, 0.4', 1);
      }
    }
  }
}
