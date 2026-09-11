// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * routes.js - What each player does once the ball is snapped.
 *
 * PORTED FROM THE 2D GAME's animations.class.tsx (D2). One method per position
 * and per route shape: receivers run go routes, comebacks and deep routes,
 * defensive backs cover or blitz or sit in a zone, the quarterback drops back.
 * Each is a small state machine over the player's coordinates that calls into
 * motion.js to actually move anyone.
 *
 * getZIndex IS THE BALL'S FLIGHT ARC, NOT A DRAW ORDER, despite the name. It
 * rises to the midpoint of a throw and falls after it, clamped at 7, and only
 * for throws longer than `interval * 7` so a quick out stays a flat pass. The
 * 2D renderer drew it as an ellipse that grew with height; in 3D it becomes
 * the ball's Y. Keep its timing when the crude ramp is eventually replaced by
 * a real parabola, so catches land on the frame they land on today.
 *
 * NO THREE, NO DOM, NO GLOBALS (PLANNING D1).
 */

export class ObjectAnimationsClass {

  // eslint-disable-next-line
  constructor(settings = {}, gameState = {}, motion = {}, audioObject = {}) {
    this.gameState = gameState;
    this.motion = motion;
    this.audio = audioObject;
    this.settings = settings;
    this.state = {
      container: {
        gutters: {
          x: 5,
          y: 5
        },
        height: 0,
        width: 0,
        x: 0,
        y: 0
      }
    }
  }

  // eslint-disable-next-line
  clearBoundaries(obj = {}) {
    obj.settings.route.boundaries.bottom = 0;
    obj.settings.route.boundaries.right = 0;
    obj.settings.route.boundaries.top = 0;
  }

  // eslint-disable-next-line
  getCoverCoords(obj = {}, coverObj = {}, lineInterval = 0, minX = 0, minY = 0, maxY = 0) {
    const coords = {
      x: 0,
      y: 0,
    };

    let coverX = (coverObj.coords.x + coverObj.state.xSpeed);
    let coverY = (coverObj.coords.y + coverObj.state.ySpeed);
    const objX = (obj.coords.x + obj.state.xSpeed);
    const objY = (obj.coords.y + obj.state.ySpeed);
    const midCoverY = this.gameState.getMidPoint(objY, coverY);
    const targetX = (lineInterval * 4);
    const midCoverTarget = this.gameState.getMidPoint(coverX, targetX);
    const distToCover = this.gameState.getCoordDistance(objX, objY, coverX, coverY);
    const coverIntervals = Math.floor(distToCover / (lineInterval * 0.3));

    if (coverX < minX) {
      coverX = minX;
    } else if (coverIntervals > 0) {
      coverX = midCoverTarget;
      coverY = midCoverY;
    }
    if (coverX < (lineInterval * 3) && coverX < objX) {
      if (coverY > maxY) {
        coverY = maxY;
      } else if (coverY < minY) {
        coverY = minY;
      }
    }

    coords.x = coverX;
    coords.y = coverY;

    return coords;
  }

  // eslint-disable-next-line
  getObjectByPosition(objects = [], position = '') {
    let match = null;
    objects.forEach(obj => {
      if ( obj.settings.position === position ) {
        match = obj;
        return;
      }
    });
    return match;
  }

  // eslint-disable-next-line
  getObjectIndexByPosition(objects = [], position = '') {
    let index = -1;
    const objectCount = objects.length;
    let o = 0;
    for ( o = 0; o < objectCount; o += 1 ) {
      const obj = objects[o];
      if ( obj.settings.position !== position ) {
        continue;
      } else {
        index = o;
        break;
      }
    }
    return index;
  }

  getRand(limit = 2) {
    return (Math.floor(Math.random() * limit) + 1);
  }

  // eslint-disable-next-line
  getZIndex(_dist = 0, maxDist = 0, distTraveled = 0, interval = 0) {
    let z = 1;
    const midMax = (maxDist / 2);
    if ( distTraveled < midMax ) {
      // Going up.
      let d = distTraveled;
      while ( d > 0 ) {
        z += 0.5;
        d -= (interval / 2);
      }
    } else {
      // Going down.
      let d = distTraveled;
      while ( d < maxDist ) {
        z += 0.5;
        d += (interval / 2);
      }
    }
    if ( z > 7 ) {
      z = 7;
    }
    return z;
  }

  // eslint-disable-next-line
  isInZone(obj = {}) {
    let inZone = false;
    const height = this.gameState.state.measurements.height;
    const width = this.gameState.state.measurements.width;
    const boundaries = obj.settings.route.boundaries || {
      bottom: height,
      left: 0,
      right: width,
      top: 0,
    };
    if (obj.coords.x >= boundaries.left && obj.coords.x <= boundaries.right) {
      if (obj.coords.y >= boundaries.top && obj.coords.y <= boundaries.bottom) {
        inZone = true;
      }
    }
    return inZone;
  }

  // eslint-disable-next-line
  runBallFormation(obj = {}, game = {}) {
    this.runBallRoute(obj, game);
    this.motion.moveBallObject(obj, game);
  }

  // eslint-disable-next-line
  runBallRoute(obj = {}, game = {}) {
    if ( obj.coords.list.length > 0 ) {
      const interval = 15;
      const coords = obj.coords.list.shift();
      obj.coords.x = coords[0];
      obj.coords.y = coords[1];
      const dist = this.gameState.getCoordDistance(obj.coords.x, obj.coords.y, obj.coords.targetX, obj.coords.targetY);
      const maxDist = this.gameState.getCoordDistance(obj.coords.startX, obj.coords.startY, obj.coords.targetX, obj.coords.targetY);
      const distTraveled = (maxDist - dist);
      if ( maxDist > (interval * 7)) {
        if ( distTraveled > (maxDist - interval) ) {
          obj.coords.z = 1;
        }  else {
          obj.coords.z = this.getZIndex(dist, maxDist, distTraveled, interval);
        }
      } else {
        obj.coords.z = 1;
      }
    } else {
      this.motion.checkCatch(obj, game);
      if ( !this.gameState.state.ball.caught ) {
        // Incomplete.
        this.audio.incomplete();
        this.gameState.state.anim.done = true;
      } else if ( this.gameState.state.ball.team === 1 ) {
        // Interception.
        this.gameState.state.anim.done = true;
      }
    }
  }

  /**
   * THE BLITZ, AND A NOTE ABOUT WHAT WAS TRIED HERE AND BACKED OUT.
   *
   * Straight at whoever has the ball, which is the 2D game's own blitz and is
   * all this needs to be.
   *
   * A RUSH LANE WAS BUILT HERE AND REMOVED, and the reason is worth keeping so
   * nobody builds it again. `runTo` has no notion of anything being in the way,
   * and measured, on 95% of the frames a blitzer made no progress toward the
   * quarterback there was a blocker sitting in the corridor between them, a
   * median 0.76m off his line. That looked exactly like a man who needed
   * steering round the obstacle, so he was given a lane: aim beside the blocker
   * until you are past him, with the side latched so he could not jink.
   *
   * IT BOUGHT NOTHING. Sacks at a 3.4 second hold went 5% to 5%. Worse, with
   * the real fix in place it made things slightly WORSE, 19% down to 16%,
   * because a rusher who detours around a man is a rusher not driving through
   * him. The corridor measurement was true and it was a SYMPTOM: he was in
   * contact with a blocker, not pointed the wrong way. What actually held him
   * is in motion.js, where a blocker shoves and a rusher had no way to shed
   * (see `rushShed`).
   */
  // eslint-disable-next-line
  runBlitzRoute(obj = {}, game = {}) {
    const coverObj = this.getObjectByPosition(game.objects, this.gameState.state.ball.position);
    if ( coverObj ) {
      this.motion.runTo(obj, coverObj.coords.x, coverObj.coords.y);
      this.motion.moveObject(obj, game);
    }
  }

  // eslint-disable-next-line
  runCoverRoute(obj = {}, game = {}, lineInterval = 0, minX = 0, minY = 0, maxY = 0) {
    if ( game.runForYourLife || ( game.throwTo && this.gameState.state.ball.caught ) ) {
      // QB run or caught pass.
      const coverObj = this.getObjectByPosition(game.objects, this.gameState.state.ball.position);
      if ( coverObj ) {
        const coverCoords = this.getCoverCoords(obj, coverObj, lineInterval, minX, minY, maxY);
        this.motion.runTo(obj, coverCoords.x, coverCoords.y);
        this.motion.moveObject(obj, game);
      } else {
        this.motion.runAround(obj, game);
      }
    } else if ( game.throwTo && !this.gameState.state.ball.caught ) {
      // Ball in air / not caught.
      const ballObj = this.getObjectByPosition(game.objects, 'ball');
      if ( ballObj ) {
        const distToCover = this.gameState.getCoordDistance(obj.coords.x, obj.coords.y, ballObj.coords.targetX, ballObj.coords.targetY);
        const coverIntervals = Math.floor(distToCover / (lineInterval * 0.5));
        if (coverIntervals < 1) {
          // Close to ball.  Got for int.
          this.motion.runTo(obj, (ballObj.coords.targetX - 10), ballObj.coords.targetY);
          this.motion.moveObject(obj, game);
        } else {
          // Far from ball.  Go for stop.
          const targetX = (lineInterval * 4);
          if (ballObj.coords.targetX < targetX) {
            const midCoverTarget = this.gameState.getMidPoint(ballObj.coords.targetX, targetX);
            this.motion.runTo(obj, midCoverTarget, ballObj.coords.targetY);
            this.motion.moveObject(obj, game);
          } else {
            this.motion.runTo(obj, (ballObj.coords.targetX - 10), ballObj.coords.targetY);
            this.motion.moveObject(obj, game);
          }
        }
      } else {
        this.motion.runAround(obj, game);
      }
    } else {
      // Default.
      if (obj.settings.route.cover) {
        const coverObj = this.getObjectByPosition(game.objects, obj.settings.route.cover);
        if ( coverObj && coverObj.coords.x > 0 ) {
          const coverX = (coverObj.coords.x + coverObj.state.xSpeed);
          const coverY = (coverObj.coords.y + coverObj.state.ySpeed);
          // Slow x.
          if (coverX < obj.coords.x && coverObj.state.xSpeed > 0 && obj.state.xSpeed < 0 && obj.coords.x < (lineInterval * 2)) {
            obj.state.xSpeed *= 0.2;
          }
          this.motion.runTo(obj, coverX, coverY);
          this.motion.moveObject(obj, game);
        } else {
          this.motion.runAround(obj, game);
        }
      } else {
        this.motion.runAround(obj, game);
      }
    }
  }

  // eslint-disable-next-line
  runDbFormation(obj = {}, game = {}, lineInterval = 0) {
    if ( game.runForYourLife || ( game.throwTo && this.gameState.state.ball.caught ) ) {
      this.clearBoundaries(obj);
    }
    this.runDbRoute(obj, game, lineInterval);
  }

  // eslint-disable-next-line
  runDbRoute(obj = {}, game = {}, lineInterval = 0) {
    let minX = 0;
    let minY = 0;
    let maxY = this.gameState.state.measurements.height;
    if ( obj.settings.route && obj.settings.route.type ) {
      switch ( obj.settings.route.type ) {
        case 'blitz':
          this.runBlitzRoute(obj, game);
          break;
        case 'cover':
        case 'man':
          switch (obj.settings.position) {
            case 'db1':
              minX = (lineInterval * 1.4);
              maxY = (this.gameState.state.measurements.height / 2);
              break;
            case 'db2':
              minX = (lineInterval * 1.4);
              maxY = (this.gameState.state.measurements.height / 2);
              break;
            case 'db3':
              minX = (lineInterval * 1.6);
              minY = (this.gameState.state.measurements.height / 2);
              break;
            default:
              minX = (lineInterval * 1.2);
              break;
          }
          this.runCoverRoute(obj, game, lineInterval, minX, minY, maxY);
          break;
        case 'zone':
          switch (obj.settings.position) {
            case 'db1':
              minX = (lineInterval * 1.5);
              maxY = (this.gameState.state.measurements.height / 2);
              break;
            case 'db2':
              minX = (lineInterval * 1.5);
              maxY = (this.gameState.state.measurements.height / 2);
              break;
            case 'db3':
              minX = (lineInterval * 1.7);
              minY = (this.gameState.state.measurements.height / 2);
              break;
            case 'db4':
              minY = (this.gameState.state.measurements.height / 2);
              break;
            default:
              minX = (lineInterval * 1.3);
              break;
          }
          this.runZoneRoute(obj, game, lineInterval, minX, minY, maxY);
          break;
        default:
          this.runZoneRoute(obj, game, lineInterval, minX, minY, maxY);
          break;
      }
    }
  }

  // eslint-disable-next-line
  runFormation(obj = {}, game = {}) {
    const lineInterval = this.gameState.state.measurements.lineInterval;
    switch ( obj.settings.positionGroup ) {
      case 'ball':
        this.runBallFormation(obj, game);
        break;
      case 'db':
        this.runDbFormation(obj, game, lineInterval);
        break;
      case 'qb':
        this.runQbFormation(obj, game, lineInterval);
        break;
      case 's':
        this.runSFormation(obj, game, lineInterval);
        break;
      case 'wr':
        this.runWrFormation(obj, game, lineInterval);
        break;
      case 'x':
        this.runXFormation(obj, game, lineInterval);
        break;
      default:
        // console.log(obj.settings.positionGroup);
        break;
    }
  }

  // eslint-disable-next-line
  runQbFormation(obj = {}, game = {}, lineInterval = 0) {
    const height = this.gameState.state.measurements.height;
    const width = this.gameState.state.measurements.width;
    const x = -4;
    if ( this.gameState.state.tackled ) {
      // Tackled.
      this.gameState.state.anim.done = true;
    } else if ( !game.runForYourLife && (!game.throwTo || !this.gameState.state.ball.caught) ) {
      if ( !game.throwTo ) {
        // Still holding ball.
        // Find closest defender.
        const defenderObj = this.gameState.getClosestTeamObjectToPosition(game.objects, 1, obj.coords.x, obj.coords.y, lineInterval, ['db1', 'db2', 'db3', 'db4', 'db6', 's1', 's2']);
        if ( defenderObj ) {
          // A defender is close.
          // Evade defender.
          this.motion.accelFrom(obj, (defenderObj.coords.x + defenderObj.state.xSpeed), (defenderObj.coords.y + defenderObj.state.ySpeed));
          this.motion.correctBoundaryOverruns(obj);
          this.motion.moveObject(obj, game);
        } else {
          // No defenders are close.
          if ( !this.gameState.state.tackled ) {
            this.motion.runAround(obj, game);
          } else {
            this.motion.decelX(obj);
            this.motion.decelY(obj);
            this.motion.moveObject(obj, game);
          }
        }
      } else {
        // Ball thrown.
        if ( !this.gameState.state.tackled ) {
          this.motion.runAround(obj, game);
        } else {
          this.motion.decelX(obj);
          this.motion.decelY(obj);
          this.motion.moveObject(obj, game);
        }
      }
    } else if ( game.runForYourLife ) {
      // Run for your life!
      obj.settings.route.boundaries.bottom = height - (this.settings.style.gutters.y);
      obj.settings.route.boundaries.left = (lineInterval * 1.2);
      obj.settings.route.boundaries.right = (lineInterval * 5);
      obj.settings.route.boundaries.top = (this.settings.style.gutters.y * 12);
      if ( !this.gameState.state.tackled ) {
        // Still running.
        if ( obj.coords.x > 0 && obj.coords.x < width && obj.coords.y > (this.settings.style.gutters.y * 2) && obj.coords.y < (height + this.settings.style.gutters.y * 2) ) {
          // In bounds.
          if ( obj.coords.x < (x + (lineInterval * 4)) ) {
            // Still running.
            // Find closest defenders.
            const defenderObjs = this.gameState.getClosestTeamObjectsToPosition(game.objects, 1, obj.coords.x, obj.coords.y, (lineInterval / 2), ['db1', 'db2', 'db3', 'db4', 'db6', 's1', 's2'], 1);
            if ( defenderObjs.length > 0 ) {
              // One or more defenders are close.
              defenderObjs.forEach((defenderObj) => {
                // Evade defender.
                this.motion.runFrom(obj, (defenderObj.obj.coords.x + defenderObj.obj.state.xSpeed), (defenderObj.obj.coords.y + defenderObj.obj.state.ySpeed));
              });
              this.motion.correctBoundaryOverruns(obj);
              this.motion.moveObject(obj, game);
            } else {
              // No defenders are close.
              if ( !obj.state.formation ) {
                if ( obj.coords.y <= this.state.container.y ) {
                  this.runWrHighDeepRoute(obj, lineInterval);
                } else {
                  this.runWrLowDeepRoute(obj, lineInterval);
                }
              } else {
                switch ( obj.state.formation ) {
                  case 'pass2':
                  case 'pass5':
                  case 'run1':
                  case 'run3':
                  case 'screen2':
                    this.runWrLowDeepRoute(obj, lineInterval);
                    break;
                  case 'pass8':
                    this.runWrMidHighDeepRoute(obj, lineInterval);
                    break;
                  case 'screen1':
                    this.runWrHighDeepRoute(obj, lineInterval);
                    break;
                  case 'run2':
                    this.runWrHighDeepRoute(obj, lineInterval);
                    break;
                  default:
                    if ( obj.coords.y <= this.state.container.y ) {
                      this.runWrMidHighDeepRoute(obj, lineInterval);
                    } else {
                      this.runWrMidLowDeepRoute(obj, lineInterval);
                    }
                    break;
                }
              }
              this.motion.moveObject(obj, game);
            }
          } else {
            // 50 points!
            // Touchdown!
            this.gameState.state.anim.run50 = true;
            this.gameState.state.anim.done = true;
          }
        } else {
          // Out of bounds.
          this.gameState.state.tackled = true;
          this.gameState.state.anim.done = true;
        }
      } else {
        // Tackled.
        this.gameState.state.anim.done = true;
      }
    } else if ( !this.gameState.state.tackled && this.gameState.state.ball.caught ) {
      // Ball caught.
      // Run to ball.
      // Remove boundaries.
      obj.settings.route.boundaries.bottom = height - (this.settings.style.gutters.y * 4);
      obj.settings.route.boundaries.right = (lineInterval * 5);
      obj.settings.route.boundaries.top = (this.settings.style.gutters.y * 12);
      // Find receiver.
      const receiverObj = this.getObjectByPosition(game.objects, this.gameState.state.ball.position);
      if ( receiverObj ) {
        const recX = (receiverObj.coords.x + (receiverObj.state.xSpeed * 30));
        const recY = (receiverObj.coords.y + (receiverObj.state.ySpeed * 10));
        // Find closest defender.
        const defenderObj = this.gameState.getClosestTeamObjectToPosition(game.objects, 1, recX, recY, 90, ['db1', 'db2', 'db3', 'db4', 'db6', 's1', 's2']);
        if ( defenderObj ) {
          // Run to defender.
          const defX = (defenderObj.coords.x + (defenderObj.state.xSpeed * 1));
          const defY = (defenderObj.coords.y + (defenderObj.state.ySpeed * 1));
          this.motion.accelTo(obj, defX, defY);
          this.motion.moveObject(obj, game);
        } else {
          this.motion.accelTo(obj, recX, recY);
          this.motion.moveObject(obj, game);
        }
      } else {
        this.motion.decelX(obj);
        this.motion.decelY(obj);
        this.motion.moveObject(obj, game);
      }
    } else {
      // All other conditions.
      if ( !this.gameState.state.tackled ) {
        this.motion.runAround(obj, game);
      } else {
        this.motion.decelX(obj);
        this.motion.decelY(obj);
        this.motion.moveObject(obj, game);
      }
    }
  }

  // eslint-disable-next-line
  runSFormation(obj = {}, game = {}, lineInterval = 0) {
    let maxY = this.gameState.state.measurements.height;
    let minX = (lineInterval * 2.5);
    let minY = (this.gameState.state.measurements.height / 2);
    if (obj.settings.position === 's2') {
      minX = (lineInterval * 2);
      minY = 0;
      maxY = (this.gameState.state.measurements.height / 2);
    }
    if ( game.runForYourLife || ( game.throwTo && this.gameState.state.ball.caught ) ) {
      this.clearBoundaries(obj);
    }
    if ( obj.settings.route && obj.settings.route.type ) {
      switch ( obj.settings.route.type ) {
        case 'blitz':
          this.runBlitzRoute(obj, game);
          break;
        case 'cover':
        case 'man':
          this.runCoverRoute(obj, game, lineInterval, minX, minY, maxY);
          break;
        default:
          this.runZoneRoute(obj, game, lineInterval, minX, minY, maxY);
          break;
      }
    }
  }

  // eslint-disable-next-line
  runWrComebackDownRoute(obj = {}, lineInterval = 0) {
    const height = this.gameState.state.measurements.height;
    const breakX = Math.floor(lineInterval * obj.settings.route.break);
    const xTarget = (breakX - (lineInterval / 3));
    let yTarget = (obj.coords.startY + (lineInterval / 2));
    if ( yTarget > ( height - 20) ) {
      yTarget = (height - 20);
    }
    if ( !obj.state.break ) {
      if ( breakX > obj.coords.x ) {
        this.motion.accelDownfield(obj);
      } else if ( breakX < obj.coords.x ) {
        obj.state.break = true;
        this.motion.accelUpfield(obj);
      } else {
        this.motion.decelX(obj);
      }
      if ( obj.coords.y < obj.coords.startY ) {
        this.motion.accelToRightSideline(obj);
      } else if ( obj.coords.y > obj.coords.startY ) {
        this.motion.accelToLeftSideline(obj);
      }
    } else {
      this.motion.runTo(obj, xTarget, yTarget);
    }
  }

  // eslint-disable-next-line
  runWrComebackUpRoute(obj = {}, lineInterval = 0) {
    const breakX = Math.floor(lineInterval * obj.settings.route.break);
    const xTarget = (breakX - (lineInterval / 3));
    let yTarget = (obj.coords.startY - (lineInterval / 2));
    if ( yTarget < (this.settings.style.gutters.y * 7) ) {
      yTarget = (this.settings.style.gutters.y * 7);
    }
    if ( !obj.state.break ) {
      if ( breakX > obj.coords.x ) {
        this.motion.accelDownfield(obj);
      } else if ( breakX < obj.coords.x ) {
        obj.state.break = true;
        this.motion.accelUpfield(obj);
      } else {
        this.motion.decelX(obj);
      }
      if ( obj.coords.y < obj.coords.startY ) {
        this.motion.accelToRightSideline(obj);
      } else if ( obj.coords.y > obj.coords.startY ) {
        this.motion.accelToLeftSideline(obj);
      }
    } else {
      this.motion.runTo(obj, xTarget, yTarget);
    }
  }

  // eslint-disable-next-line
  runWrDeepRoute(obj = {}, lineInterval = 0) {
    const breakX = Math.floor(lineInterval * obj.settings.route.break);
    const xTarget = Math.floor(this.state.container.width - (lineInterval / 2));
    const yTarget = Math.floor(this.state.container.height / 2);
    if ( obj.coords.x < breakX ) {
      if ( xTarget > obj.coords.x ) {
        this.motion.accelDownfield(obj);
      } else if ( xTarget < obj.coords.x ) {
        this.motion.accelUpfield(obj);
      } else {
        this.motion.decelX(obj);
      }
      if ( obj.coords.y < obj.coords.startY ) {
        this.motion.accelToRightSideline(obj);
      } else if ( obj.coords.y > obj.coords.startY ) {
        this.motion.accelToLeftSideline(obj);
      }
    } else {
      if ( obj.coords.y < yTarget ) {
        this.motion.accelToRightSideline(obj);
      } else if ( obj.coords.y > yTarget ) {
        this.motion.accelToLeftSideline(obj);
      }
      this.motion.accelTo(obj, xTarget, yTarget);
    }
  }

  // eslint-disable-next-line
  runWrEvadeRoute(obj = {}, game = {}) {
    const evadeObj = this.getObjectByPosition(game.objects, obj.settings.route.evade);
    if ( evadeObj ) {
      this.motion.accelFrom(obj, evadeObj.coords.x, evadeObj.coords.y);
      this.motion.moveObject(obj, game);
    }
  }

  // eslint-disable-next-line
  runWrFormation(obj = {}, game = {}, lineInterval = 0) {
    const height = this.gameState.state.measurements.height;
    const width = this.gameState.state.measurements.width;
    const x = -4;
    if ( !game.runForYourLife && !game.throwTo ) {
      // Run route.
      this.runWrRoute(obj, game, lineInterval);
    } else if ( game.runForYourLife ) {
      // QB run.
      // Remove boundaries.
      obj.settings.route.boundaries.bottom = this.state.container.height;
      obj.settings.route.boundaries.left = 0;
      obj.settings.route.boundaries.right = this.state.container.width;
      obj.settings.route.boundaries.top = 0;
      // Find QB.
      const qbObj = this.getObjectByPosition(game.objects, 'qb');
      if ( qbObj ) {
        const qbX = (qbObj.coords.x + qbObj.state.xSpeed);
        const qbY = (qbObj.coords.y + qbObj.state.ySpeed);
        // Find closest defender.
        const defenderObj = this.gameState.getClosestTeamObjectToPosition(game.objects, 1, (obj.coords.x + (lineInterval / 3)), obj.coords.y, (lineInterval * 1.5), ['db1', 'db2', 'db3', 'db4', 'db6', 's1', 's2']);
        if ( defenderObj ) {
          // Run to defender.
          const defX = (defenderObj.coords.x + defenderObj.state.xSpeed);
          const defY = (defenderObj.coords.y + defenderObj.state.ySpeed);
          this.motion.accelTo(obj, defX, defY);
          this.motion.moveObject(obj, game);
        } else {
          // Run to QB.
          this.motion.accelTo(obj, (qbX + (lineInterval / 2)), qbY);
          this.motion.moveObject(obj, game);
        }
      } else {
        // Run route.
        this.runWrRoute(obj, game, lineInterval);
      }
    } else if ( game.throwTo ) {
      if ( !this.gameState.state.ball.caught ) {
        // Ball in air / not caught.
        if ( obj.settings.position !== game.throwTo ) {
          // Run to receiver.
          // Remove boundaries.
          obj.settings.route.boundaries.bottom = this.state.container.height;
          obj.settings.route.boundaries.left = 0;
          obj.settings.route.boundaries.right = this.state.container.width;
          obj.settings.route.boundaries.top = 0;
          // Find receiver.
          const receiverObj = this.getObjectByPosition(game.objects, game.throwTo);
          if ( receiverObj ) {
            const recX = (receiverObj.coords.x + receiverObj.state.xSpeed);
            const recY = (receiverObj.coords.y + receiverObj.state.ySpeed);
            // Find closest defender.
            const defenderObj = this.gameState.getClosestTeamObjectToPosition(game.objects, 1, (recX + 40), recY, 80, ['db1', 'db2', 'db3', 'db4', 'db6', 's1', 's2']);
            if ( defenderObj ) {
              // Run to defender.
              const defX = (defenderObj.coords.x + defenderObj.state.xSpeed);
              const defY = (defenderObj.coords.y + defenderObj.state.ySpeed);
              this.motion.accelTo(obj, defX, defY);
              this.motion.moveObject(obj, game);
            } else {
              this.motion.accelTo(obj, (recX + 40), recY);
              this.motion.moveObject(obj, game);
            }
          } else {
            // Run route.
            this.runWrRoute(obj, game, lineInterval);
          }
        } else {
          const ballObj = this.getObjectByPosition(game.objects, 'ball');
          if ( ballObj ) {
            const ballDist = this.gameState.getCoordDistance(ballObj.coords.x, ballObj.coords.y, obj.coords.x, obj.coords.y);
            if ( ballDist < 30 ) {
              this.motion.runTo(obj, ballObj.coords.x, ballObj.coords.y);
              this.motion.moveObject(obj, game);
            } else {
              this.motion.accelToBall(obj, ballObj);
              this.motion.moveObject(obj, game);
            }
          } else {
            this.runWrRoute(obj, game, lineInterval);
          }
        }
      } else {
        // Ball caught.
        if ( obj.settings.position !== this.gameState.state.ball.position ) {
          // Run to ball.
          // Remove boundaries.
          obj.settings.route.boundaries.bottom = this.state.container.height;
          obj.settings.route.boundaries.left = 0;
          obj.settings.route.boundaries.right = this.state.container.width;
          obj.settings.route.boundaries.top = 0;
          // Find receiver.
          const receiverObj = this.getObjectByPosition(game.objects, this.gameState.state.ball.position);
          if ( receiverObj ) {
            const recX = (receiverObj.coords.x + receiverObj.state.xSpeed);
            const recY = (receiverObj.coords.y + receiverObj.state.ySpeed);
            // Find closest defender.
            const defenderObj = this.gameState.getClosestTeamObjectToPosition(game.objects, 1, (recX + (lineInterval / 3)), recY, lineInterval, ['db1', 'db2', 'db3', 'db4', 'db6', 's1', 's2']);
            if ( defenderObj ) {
              // Run to defender.
              const defX = (defenderObj.coords.x + defenderObj.state.xSpeed);
              const defY = (defenderObj.coords.y + defenderObj.state.ySpeed);
              // Find mid point.
              // const midX = this.gameState.getMidPoint(recX, defX);
              // const midY = this.gameState.getMidPoint(recY, defY);
              this.motion.accelTo(obj, defX, defY);
              this.motion.moveObject(obj, game);
            } else {
              this.motion.accelTo(obj, (recX + (lineInterval / 2)), recY);
              this.motion.moveObject(obj, game);
            }
          } else {
            // Run route.
            this.runWrRoute(obj, game, lineInterval);
          }
        } else {
          // Run with ball.
          obj.state.hasBall = true;
          if ( !this.gameState.state.tackled ) {
            // Not tackled.
            if ( obj.coords.x > 0 && obj.coords.x < width && obj.coords.y > (this.settings.style.gutters.y * 2) && obj.coords.y < (height + (this.settings.style.gutters.y * 4)) ) {
              // In bounds.
              if ( obj.coords.x < (x + (lineInterval * 4)) ) {
                // Still running.
                // Find closest defenders.
                const defenderObjs = this.gameState.getClosestTeamObjectsToPosition(game.objects, 1, obj.coords.x, obj.coords.y, (lineInterval / 2), ['db1', 'db2', 'db3', 'db4', 'db6', 's1', 's2'], 1);
                if ( defenderObjs.length > 0 ) {
                  // One or more defenders are close.
                  defenderObjs.forEach((defenderObj) => {
                    // Evade defender.
                    this.motion.runFrom(obj, (defenderObj.obj.coords.x + defenderObj.obj.state.xSpeed), (defenderObj.obj.coords.y + defenderObj.obj.state.ySpeed));
                  });
                  this.motion.correctBoundaryOverruns(obj);
                  this.motion.moveObject(obj, game);
                } else {
                  // No defender close.
                  // Run route.
                  if ( !obj.state.formation ) {
                    if ( obj.coords.y <= this.state.container.y ) {
                      this.runWrHighDeepRoute(obj, lineInterval);
                      this.motion.moveObject(obj, game);
                    } else {
                      this.runWrLowDeepRoute(obj, lineInterval);
                      this.motion.moveObject(obj, game);
                    }
                  } else {
                    switch ( obj.state.formation ) {
                      case 'screen1':
                        this.runWrHighDeepRoute(obj, lineInterval);
                        this.motion.moveObject(obj, game);
                        break;
                      default:
                        if ( obj.coords.y <= this.state.container.y ) {
                          this.runWrHighDeepRoute(obj, lineInterval);
                          this.motion.moveObject(obj, game);
                        } else {
                          this.runWrLowDeepRoute(obj, lineInterval);
                          this.motion.moveObject(obj, game);
                        }
                        break;
                    }
                  }
                }
              } else {
                // 50 points!
                // Touchdown!
                this.gameState.state.anim.done = true;
              }
            } else {
              // Out of bounds.
              this.gameState.state.tackled = true;
              this.gameState.state.anim.done = true;
            }
          } else {
            // Tackled.
            this.gameState.state.anim.done = true;
          }
        }
      }
    }
  }

  // eslint-disable-next-line
  runWrGoRoute(obj = {}, lineInterval = 0) {
    const xTarget = (lineInterval * 4.6);
    const yTarget = obj.coords.startY;
    if ( xTarget > obj.coords.x ) {
      this.motion.accelDownfield(obj);
    } else if ( xTarget < obj.coords.x ) {
      this.motion.accelUpfield(obj);
      // obj.settings.route.type = 'evade';
    } else {
      this.motion.decelX(obj);
    }
    if ( obj.coords.y < yTarget ) {
      this.motion.accelToRightSideline(obj);
    } else if ( obj.coords.y > yTarget ) {
      this.motion.accelToLeftSideline(obj);
    }
  }

  // eslint-disable-next-line
  runWrHighDeepRoute(obj = {}, lineInterval = 0) {
    const height = this.gameState.state.measurements.height;
    const yInterval = ( height / 8);
    const breakX = Math.floor(lineInterval * obj.settings.route.break);
    const xTarget = Math.floor(this.state.container.width - (lineInterval / 2));
    const yTarget = (yInterval * 1);
    if ( obj.coords.x < breakX ) {
      if ( xTarget > obj.coords.x ) {
        this.motion.accelDownfield(obj);
      } else if ( xTarget < obj.coords.x ) {
        this.motion.accelUpfield(obj);
      } else {
        this.motion.decelX(obj);
      }
      if ( obj.coords.y < obj.coords.startY ) {
        this.motion.accelToRightSideline(obj);
      } else if ( obj.coords.y > obj.coords.startY ) {
        this.motion.accelToLeftSideline(obj);
      }
    } else {
      if ( obj.coords.y < yTarget ) {
        this.motion.accelToRightSideline(obj);
      } else if ( obj.coords.y > yTarget ) {
        this.motion.accelToLeftSideline(obj);
      }
      this.motion.runTo(obj, xTarget, yTarget);
    }
  }

  // eslint-disable-next-line
  runWrLowDeepRoute(obj = {}, lineInterval = 0) {
    const gutterY1 = 5;
    const height = this.gameState.state.measurements.height;
    const breakX = Math.floor(lineInterval * obj.settings.route.break);
    const xTarget = Math.floor(this.state.container.width - (lineInterval / 2));
    const yTarget = (height - (this.settings.style.gutters.y * gutterY1));
    if ( obj.coords.x < breakX ) {
      if ( xTarget > obj.coords.x ) {
        this.motion.accelDownfield(obj);
      } else if ( xTarget < obj.coords.x ) {
        this.motion.accelUpfield(obj);
      } else {
        this.motion.decelX(obj);
      }
      if ( obj.coords.y < obj.coords.startY ) {
        this.motion.accelToRightSideline(obj);
      } else if ( obj.coords.y > obj.coords.startY ) {
        this.motion.accelToLeftSideline(obj);
      }
    } else {
      if ( obj.coords.y < yTarget ) {
        this.motion.accelToRightSideline(obj);
      } else if ( obj.coords.y > yTarget ) {
        this.motion.accelToLeftSideline(obj);
      }
      this.motion.runTo(obj, xTarget, yTarget);
    }
  }

  // eslint-disable-next-line
  runWrMidHighDeepRoute(obj = {}, lineInterval = 0) {
    const height = this.gameState.state.measurements.height;
    const breakX = Math.floor(lineInterval * obj.settings.route.break);
    const xTarget = Math.floor(this.state.container.width - (lineInterval / 2));
    const yTarget = Math.floor(height / 2) - (this.settings.style.gutters.y * 12);
    if ( obj.coords.x < breakX ) {
      if ( xTarget > obj.coords.x ) {
        this.motion.accelDownfield(obj);
      } else if ( xTarget < obj.coords.x ) {
        this.motion.accelUpfield(obj);
      } else {
        this.motion.decelX(obj);
      }
      if ( obj.coords.y < obj.coords.startY ) {
        this.motion.accelToRightSideline(obj);
      } else if ( obj.coords.y > obj.coords.startY ) {
        this.motion.accelToLeftSideline(obj);
      }
    } else {
      if ( obj.coords.y < yTarget ) {
        this.motion.accelToRightSideline(obj);
      } else if ( obj.coords.y > yTarget ) {
        this.motion.accelToLeftSideline(obj);
      }
      this.motion.accelTo(obj, xTarget, yTarget);
    }
  }

  // eslint-disable-next-line
  runWrMidLowDeepRoute(obj = {}, lineInterval = 0) {
    const height = this.gameState.state.measurements.height;
    const yInterval = (height / 5);
    const breakX = Math.floor(lineInterval * obj.settings.route.break);
    const xTarget = Math.floor(this.state.container.width - (lineInterval / 2));
    const yTarget = (this.state.container.y + yInterval);
    if ( obj.coords.x < breakX ) {
      if ( xTarget > obj.coords.x ) {
        this.motion.accelDownfield(obj);
      } else if ( xTarget < obj.coords.x ) {
        this.motion.accelUpfield(obj);
      } else {
        this.motion.decelX(obj);
      }
      if ( obj.coords.y < obj.coords.startY ) {
        this.motion.accelToRightSideline(obj);
      } else if ( obj.coords.y > obj.coords.startY ) {
        this.motion.accelToLeftSideline(obj);
      }
    } else {
      if ( obj.coords.y < yTarget ) {
        this.motion.accelToRightSideline(obj);
      } else if ( obj.coords.y > yTarget ) {
        this.motion.accelToLeftSideline(obj);
      }
      this.motion.runTo(obj, xTarget, yTarget);
    }
  }

  // eslint-disable-next-line
  runWrRoute(obj = {}, game = {}, lineInterval = 0) {
    if ( obj.settings.route && obj.settings.route.type ) {
      switch ( obj.settings.route.type ) {
        case 'comeback-down':
          this.runWrComebackDownRoute(obj, lineInterval);
          this.motion.moveObject(obj, game);
          break;
        case 'comeback-up':
          this.runWrComebackUpRoute(obj, lineInterval);
          this.motion.moveObject(obj, game);
          break;
        case 'deep':
          this.runWrDeepRoute(obj, lineInterval);
          this.motion.moveObject(obj, game);
          break;
        case 'evade':
          this.runWrEvadeRoute(obj, game);
          break;
        case 'go':
          this.runWrGoRoute(obj, lineInterval);
          this.motion.moveObject(obj, game);
          break;
        case 'high-deep':
          this.runWrHighDeepRoute(obj, lineInterval);
          this.motion.moveObject(obj, game);
          break;
        case 'low-deep':
          this.runWrLowDeepRoute(obj, lineInterval);
          this.motion.moveObject(obj, game);
          break;
        case 'mid-high-deep':
          this.runWrMidHighDeepRoute(obj, lineInterval);
          this.motion.moveObject(obj, game);
          break;
        case 'mid-low-deep':
          this.runWrMidLowDeepRoute(obj, lineInterval);
          this.motion.moveObject(obj, game);
          break;
        case 'stop':
          this.runWrStopRoute(obj, lineInterval);
          this.motion.moveObject(obj, game);
          break;
        default:
          break;
      }
    }
  }

  // eslint-disable-next-line
  runWrStopRoute(obj = {}, lineInterval = 0) {
    const width = this.gameState.state.measurements.width;
    const height = this.gameState.state.measurements.height;
    const breakX = Math.floor(lineInterval * obj.settings.route.break);
    let xTarget = obj.settings.route.stopX;
    if ( xTarget > (width - (this.settings.style.gutters.x * 2)) ) {
      xTarget = (width - (this.settings.style.gutters.x * 2));
    } else if ( xTarget < (this.settings.style.gutters.x * 2) ) {
      xTarget = (this.settings.style.gutters.x * 2);
    }
    let yTarget = obj.settings.route.stopY;
    if ( yTarget > ( height - (this.settings.style.gutters.x * 2)) ) {
      yTarget = (height - (this.settings.style.gutters.x * 2));
    } else if ( yTarget < (this.settings.style.gutters.x * 2) ) {
      yTarget = (this.settings.style.gutters.x * 2);
    }
    if ( !obj.state.break ) {
      if ( breakX > obj.coords.x ) {
        this.motion.accelDownfield(obj);
      } else if ( breakX < obj.coords.x ) {
        obj.state.break = true;
        this.motion.accelUpfield(obj);
      } else {
        this.motion.decelX(obj);
      }
      if ( obj.coords.y < obj.coords.startY ) {
        this.motion.accelToRightSideline(obj);
      } else if ( obj.coords.y > obj.coords.startY ) {
        this.motion.accelToLeftSideline(obj);
      }
    } else {
      this.motion.runTo(obj, xTarget, yTarget);
    }
  }

  // eslint-disable-next-line
  runXFormation(obj = {}, game = {}, lineInterval = 0) {
    if ( !game.runForYourLife && !game.throwTo ) {
      // QB in pocket.
      if ( obj.settings.route.break >= 1 ) {
        // Run route.
        this.runWrRoute(obj, game, lineInterval);
      } else {
        // Protect QB.
        const qbObj = this.getObjectByPosition(game.objects, 'qb');
        if ( qbObj ) {
          const qbX = (qbObj.coords.x + qbObj.state.xSpeed);
          const qbY = (qbObj.coords.y + qbObj.state.ySpeed);
          const distToQb = this.gameState.getCoordDistance(obj.coords.x, obj.coords.y, qbObj.coords.x, qbObj.coords.y);

          const defenderObj1 = this.gameState.getClosestTeamObjectToPosition(game.objects, 1, qbObj.coords.x, qbObj.coords.y, 60, ['db1', 'db2', 'db3', 'db4', 'db6', 's1', 's2']);
          if ( defenderObj1 ) {
            // Run to defender.
            const coverX = (defenderObj1.coords.x + defenderObj1.state.xSpeed);
            const coverY = (defenderObj1.coords.y + defenderObj1.state.ySpeed);
            // Find mid point.
            const midX = this.gameState.getMidPoint(qbX, coverX);
            const midY = this.gameState.getMidPoint(qbY, coverY);
            this.motion.accelTo(obj, midX, midY);
            this.motion.moveObject(obj, game);
          } else {
            const defenderObj2 = this.gameState.getClosestTeamObjectToPosition(game.objects, 1, (obj.coords.x + 20), obj.coords.y, 40, ['db1', 'db2', 'db3', 'db4', 'db6', 's1', 's2']);
            if ( defenderObj2 ) {
              // Run to defender.
              const coverX = (defenderObj2.coords.x + defenderObj2.state.xSpeed);
              const coverY = (defenderObj2.coords.y + defenderObj2.state.ySpeed);
              // Find mid point.
              const midX = this.gameState.getMidPoint(qbX, coverX);
              const midY = this.gameState.getMidPoint(qbY, coverY);
              this.motion.accelTo(obj, midX, midY);
              this.motion.moveObject(obj, game);
            } else {
              // Defender 2 not found.
              if ( distToQb > 60 ) {
                // Find mid point.
                const midX = this.gameState.getMidPoint(qbX, obj.coords.x);
                const midY = this.gameState.getMidPoint(qbY, obj.coords.y);
                // Move closer to QB.
                this.motion.accelTo(obj, midX, midY);
                this.motion.moveObject(obj, game);
              } else {
                this.runWrRoute(obj, game, lineInterval);
              }
            }
          }
        } else {
          // QB not found.
          this.runWrRoute(obj, game, lineInterval);
        }
      }
    } else if ( game.runForYourLife ) {
      // QB run.
      const qbObj = this.getObjectByPosition(game.objects, 'qb');
      if ( qbObj ) {
        const distToQb = this.gameState.getCoordDistance(obj.coords.x, obj.coords.y, qbObj.coords.x, qbObj.coords.y);
        const qbDistIntervals = Math.ceil(distToQb / 50);
        const xQbMulti = (obj.physics.xMulti * qbDistIntervals);
        const yQbMulti = (obj.physics.yMulti * qbDistIntervals);
        const qbX = (qbObj.coords.x + (qbObj.state.xSpeed * xQbMulti));
        const qbY = (qbObj.coords.y + (qbObj.state.ySpeed * yQbMulti));
        const closeDefenderObj = this.gameState.getClosestTeamObjectToPosition(game.objects, 1, obj.coords.x, obj.coords.y, (lineInterval / 5), ['db1', 'db2', 'db3', 'db4', 'db6', 's1', 's2']);
        if ( closeDefenderObj && qbObj.coords.x < (obj.coords.x - (lineInterval / 3)) ) {
          const coverX = (closeDefenderObj.coords.x + closeDefenderObj.state.xSpeed);
          const coverY = (closeDefenderObj.coords.y + closeDefenderObj.state.ySpeed);
          this.motion.accelTo(obj, coverX, coverY);
          this.motion.moveObject(obj, game);
        } else {
          const defenderObj1 = this.gameState.getClosestTeamObjectToPosition(game.objects, 1, (qbObj.coords.x + (lineInterval / 3)), qbObj.coords.y, lineInterval, ['db1', 'db2', 'db3', 'db4', 'db6', 's1', 's2']);
          if ( defenderObj1 ) {
            // Run to defender.
            this.motion.accelTo(obj, defenderObj1.coords.x, defenderObj1.coords.y);
            this.motion.moveObject(obj, game);
          } else {
            const defenderObj2 = this.gameState.getClosestTeamObjectToPosition(game.objects, 1, (obj.coords.x + (lineInterval / 3)), obj.coords.y, lineInterval, ['db1', 'db2', 'db3', 'db4', 'db6', 's1', 's2']);
            if ( defenderObj2 ) {
              // Run to defender.
              this.motion.accelTo(obj, defenderObj2.coords.x, defenderObj2.coords.y);
              this.motion.moveObject(obj, game);
            } else {
              // Defender 2 not found.
              // Run to QB.
              this.motion.accelTo(obj, (qbX + (lineInterval / 2)), qbY);
              this.motion.moveObject(obj, game);
            }
          }
        }
      } else {
        // QB not found.
        this.runWrRoute(obj, game, lineInterval);
      }
    } else if ( game.throwTo ) {
      // Pass.
      // Find receiver.
      const receiverObj = this.getObjectByPosition(game.objects, game.throwTo);
      if ( receiverObj ) {
        const distToRec = this.gameState.getCoordDistance(obj.coords.x, obj.coords.y, receiverObj.coords.x, receiverObj.coords.y);
        const recDistIntervals = Math.ceil(distToRec / 50);
        const xRecMulti = (obj.physics.xMulti * recDistIntervals);
        const yRecMulti = (obj.physics.yMulti * recDistIntervals);
        const recX = (receiverObj.coords.x + (receiverObj.state.xSpeed * xRecMulti));
        const recY = (receiverObj.coords.y + (receiverObj.state.ySpeed * yRecMulti));
        const defenderObj1 = this.gameState.getClosestTeamObjectToPosition(game.objects, 1, (receiverObj.coords.x + (lineInterval / 3)), receiverObj.coords.y, lineInterval, ['db1', 'db2', 'db3', 'db4', 'db6', 's1', 's2']);
        const closeDefenderObj = this.gameState.getClosestTeamObjectToPosition(game.objects, 1, obj.coords.x, obj.coords.y, (lineInterval / 5), ['db1', 'db2', 'db3', 'db4', 'db6', 's1', 's2']);
        if ( closeDefenderObj && receiverObj.coords.x < (obj.coords.x - (lineInterval / 3)) ) {
          const coverX = (closeDefenderObj.coords.x + closeDefenderObj.state.xSpeed);
          const coverY = (closeDefenderObj.coords.y + closeDefenderObj.state.ySpeed);
          this.motion.accelTo(obj, coverX, coverY);
          this.motion.moveObject(obj, game);
        } else {
          if ( defenderObj1 ) {
            // Run to defender.
            const coverX = (defenderObj1.coords.x + defenderObj1.state.xSpeed);
            const coverY = (defenderObj1.coords.y + defenderObj1.state.ySpeed);
            this.motion.accelTo(obj, coverX, coverY);
            this.motion.moveObject(obj, game);
          } else {
            // Defender 1 not found.
            const defenderObj2 = this.gameState.getClosestTeamObjectToPosition(game.objects, 1, (obj.coords.x + (lineInterval / 3)), obj.coords.y, lineInterval, ['db1', 'db2', 'db3', 'db4', 'db6', 's1', 's2']);
            if ( defenderObj2 ) {
              // Run to defender.
              const coverX = (defenderObj2.coords.x + defenderObj2.state.xSpeed);
              const coverY = (defenderObj2.coords.y + defenderObj2.state.ySpeed);
              this.motion.accelTo(obj, coverX, coverY);
              this.motion.moveObject(obj, game);
            } else {
              // Run to receiver.
              this.motion.accelTo(obj, (recX + (lineInterval / 2)), recY);
              this.motion.moveObject(obj, game);
            }
          }
        }
      } else {
        // Receiver not found.
        this.runWrRoute(obj, game, lineInterval);
      }
    }
  }

  // eslint-disable-next-line
  runZoneRoute(obj = {}, game = {}, lineInterval = 0, minX = 0, minY = 0, maxY = 0) {
    if ( game.runForYourLife || ( game.throwTo && this.gameState.state.ball.caught ) ) {
      // QB run or caught pass.
      const coverObj = this.getObjectByPosition(game.objects, this.gameState.state.ball.position);
      if ( coverObj ) {
        const coverCoords = this.getCoverCoords(obj, coverObj, lineInterval, minX, minY, maxY);
        this.motion.runTo(obj, coverCoords.x, coverCoords.y);
        this.motion.moveObject(obj, game);
      } else {
        this.motion.runAround(obj, game);
      }
    } else if ( game.throwTo && !this.gameState.state.ball.caught ) {
      // Ball in air / not caught.
      const ballObj = this.getObjectByPosition(game.objects, 'ball');
      if ( ballObj ) {
        const distToCover = this.gameState.getCoordDistance(obj.coords.x, obj.coords.y, ballObj.coords.targetX, ballObj.coords.targetY);
        const coverIntervals = Math.floor(distToCover / (lineInterval * 0.5));
        if (coverIntervals < 1) {
          // Close to ball.  Got for int.
          this.motion.runTo(obj, (ballObj.coords.targetX - 10), ballObj.coords.targetY);
          this.motion.moveObject(obj, game);
        } else {
          // Far from ball.  Go for stop.
          const targetX = (lineInterval * 4);
          if (ballObj.coords.targetX < targetX) {
            const midCoverTarget = this.gameState.getMidPoint(ballObj.coords.targetX, targetX);
            this.motion.runTo(obj, midCoverTarget, ballObj.coords.targetY);
            this.motion.moveObject(obj, game);
          } else {
            this.motion.runTo(obj, (ballObj.coords.targetX - 10), ballObj.coords.targetY);
            this.motion.moveObject(obj, game);
          }
        }
      } else {
        this.motion.runAround(obj, game);
      }
    } else {
      // Default.
      if (this.isInZone(obj)) {
        const closeReceiverObj = this.gameState.getClosestTeamObjectToPosition(game.objects, 0, obj.coords.x, obj.coords.y, lineInterval, ['wr1', 'wr2', 'wr3', 'wr4']);
        if (closeReceiverObj) {
          // Follow receiver.
          const coverX = (closeReceiverObj.coords.x + closeReceiverObj.state.xSpeed);
          const coverY = (closeReceiverObj.coords.y + closeReceiverObj.state.ySpeed);
          this.motion.accelTo(obj, coverX, coverY);
          this.motion.moveObject(obj, game);
        } else {
          this.motion.runAround(obj, game);
        }
      } else {
        this.motion.runAround(obj, game);
      }
    }
  }

  setContainerDimensions(height = 0, width = 0, gutterX = 0, gutterY = 0) {
    this.state.container.gutters.x = gutterX;
    this.state.container.gutters.y = gutterY;
    this.state.container.height = height - gutterY;
    this.state.container.width = width - gutterX;
    this.state.container.x = (this.state.container.width / 2);
    this.state.container.y = (this.state.container.height / 2);
  }
}
