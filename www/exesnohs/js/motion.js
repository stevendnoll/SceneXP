// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * motion.js - How every player moves, collides, catches and gets tackled.
 *
 * PORTED FROM THE 2D GAME (D2). This is the physics model, and there is no
 * physics engine behind it: two independent axes, an acceleration and a
 * deceleration per direction, a max speed per player, and four-directional box
 * collision. It is the most valuable thing carried over from the 2D game and
 * it is worth real unit tests rather than a visual check.
 *
 * NO THREE, NO DOM, NO GLOBALS. It takes plain objects with `coords`,
 * `state` and `physics` and mutates their numbers. That is the rule the whole
 * architecture rests on (PLANNING D1).
 *
 * THE AXES WERE RENAMED ON THE WAY IN. See the note in the constructor.
 */

export class MotionClass {

  // eslint-disable-next-line
  constructor(settings = {}, gameState = {}, audioObject = {}) {
    this.gameState = gameState;
    this.settings = settings;
    this.audio = audioObject;
    this.state = {};
  }

  // eslint-disable-next-line
  accelToRightSideline(obj = {}, multi = 1) {
    if ( typeof(multi) === 'undefined' ) {
      multi = 1;
    }
    if ( obj.state.ySpeed < obj.physics.maxSpeed ) {
      obj.state.ySpeed += (obj.physics.accel * multi);
      if ( obj.state.ySpeed > obj.physics.maxSpeed ) {
        obj.state.ySpeed = obj.physics.maxSpeed;
      }
    }
  }

  // eslint-disable-next-line
  accelFrom(obj = {}, xTarget = 0, yTarget = 0) {
    const direction = this.getEvadeBoundaryDirection(obj);
    if ( direction ) {
      switch ( direction ) {
        case 'down':
          this.decelToLeftSideline(obj);
          this.accelToRightSideline(obj);
          if ( obj.coords.x <= xTarget ) {
            this.decelDownfield(obj);
            this.accelUpfield(obj);
          } else {
            this.decelUpfield(obj);
            this.accelDownfield(obj);
          }
          break;
        case 'left':
          this.decelDownfield(obj);
          this.accelUpfield(obj);
          if ( obj.coords.y < yTarget ) {
            this.decelToRightSideline(obj);
            this.accelToLeftSideline(obj);
          } else {
            this.decelToLeftSideline(obj);
            this.accelToRightSideline(obj);
          }
          break;
        case 'right':
          this.decelUpfield(obj);
          this.accelDownfield(obj);
          if ( obj.coords.y <= yTarget ) {
            this.decelToRightSideline(obj);
            this.accelToLeftSideline(obj);
          } else {
            this.decelToLeftSideline(obj);
            this.accelToRightSideline(obj);
          }
          break;
        case 'up':
          this.decelToRightSideline(obj);
          this.accelToLeftSideline(obj);
          if ( obj.coords.x <= xTarget ) {
            this.decelDownfield(obj);
            this.accelUpfield(obj);
          } else {
            this.decelUpfield(obj);
            this.accelDownfield(obj);
          }
          break;
        default:
          break;
      }
    } else {
      if ( obj.coords.x <= xTarget ) {
        this.decelDownfield(obj);
        this.accelUpfield(obj);
      } else {
        this.decelUpfield(obj);
        this.accelDownfield(obj);
      }
      if ( obj.coords.y <= yTarget ) {
        this.decelToRightSideline(obj);
        this.accelToLeftSideline(obj);
      } else {
        this.decelToLeftSideline(obj);
        this.accelToRightSideline(obj);
      }
    }
  }

  // eslint-disable-next-line
  accelUpfield(obj = {}, multi = 1) {
    if ( typeof(multi) === 'undefined' ) {
      multi = 1;
    }
    if ( obj.state.xSpeed > (obj.physics.maxSpeed * -1) ) {
      obj.state.xSpeed -= (obj.physics.accel * multi);
      if ( obj.state.xSpeed < (obj.physics.maxSpeed * -1) ) {
        obj.state.xSpeed = (obj.physics.maxSpeed * -1);
      }
    }
  }

  // eslint-disable-next-line
  accelQ1(obj = {}) {
    this.accelToLeftSideline(obj);
    this.accelUpfield(obj);
  }

  // eslint-disable-next-line
  accelQ2(obj = {}) {
    this.accelToLeftSideline(obj);
    this.accelDownfield(obj);
  }

  // eslint-disable-next-line
  accelQ3(obj = {}) {
    this.accelToRightSideline(obj);
    this.accelDownfield(obj);
  }

  // eslint-disable-next-line
  accelQ4(obj = {}) {
    this.accelToRightSideline(obj);
    this.accelUpfield(obj);
  }

  // eslint-disable-next-line
  accelDownfield(obj = {}, multi = 1) {
    if ( typeof(multi) === 'undefined' ) {
      multi = 1;
    }
    if ( obj.state.xSpeed < obj.physics.maxSpeed ) {
      obj.state.xSpeed += (obj.physics.accel * multi);
      if ( obj.state.xSpeed > obj.physics.maxSpeed ) {
        obj.state.xSpeed = obj.physics.maxSpeed;
      }
    }
  }

  // eslint-disable-next-line
  accelTo(obj = {}, xTarget = 0, yTarget = 0) {
    if ( obj.coords.x < xTarget ) {
      this.accelDownfield(obj);
    } else if ( obj.coords.x > xTarget ) {
      this.accelUpfield(obj);
    } else {
      obj.coords.x = xTarget;
    }
    if ( obj.coords.y < yTarget ) {
      this.accelToRightSideline(obj);
    } else if ( obj.coords.y > yTarget ) {
      this.accelToLeftSideline(obj);
    } else {
      obj.coords.y = yTarget;
    }
  }

  // eslint-disable-next-line
  accelToBall(obj = {}, ball = {}) {
    if ( obj.coords.x > ball.coords.targetX ) {
      this.decelDownfield(obj);
      this.accelUpfield(obj);
    } else if ( obj.coords.x < ball.coords.targetX ) {
      this.decelUpfield(obj);
      this.accelDownfield(obj);
    } else {
      obj.coords.x = ball.coords.targetX;
    }
    if ( obj.coords.y < ball.coords.targetY ) {
      this.decelToLeftSideline(obj);
      this.accelToRightSideline(obj);
    } else if ( obj.coords.y > ball.coords.targetY ) {
      this.decelToRightSideline(obj);
      this.accelToLeftSideline(obj);
    } else {
      obj.coords.y = ball.coords.targetY;
    }
  }

  // eslint-disable-next-line
  accelToLeftSideline(obj = {}, multi = 1) {
    if ( typeof(multi) === 'undefined' ) {
      multi = 1;
    }
    if ( obj.state.ySpeed > (obj.physics.maxSpeed * -1) ) {
      obj.state.ySpeed -= (obj.physics.accel * multi);
      if ( obj.state.ySpeed < (obj.physics.maxSpeed * -1) ) {
        obj.state.ySpeed = (obj.physics.maxSpeed * -1);
      }
    }
    // Defender.
    if ( obj.settings.team === 1 ) {
      if ( obj.coords.y < 40 && Math.abs(obj.state.ySpeed) > (obj.physics.maxSpeed / 3) ) {
        this.slowObjectUp(obj, (obj.physics.maxSpeed / 3));
      }
    }
  }

  // eslint-disable-next-line
  changeDirection(obj = {}) {
    const directionList = ['down', 'left', 'right', 'up'];
    const lastDirection = obj.state.direction;
    const lastDirectionIndex = directionList.indexOf(lastDirection);
    if ( lastDirectionIndex > -1 ) {
      directionList.splice(lastDirectionIndex, 1);
    }
    const nextDirectionIndex = Math.floor(Math.random() * directionList.length);
    if (typeof (directionList[nextDirectionIndex]) !== 'undefined') {
      obj.state.direction = directionList[nextDirectionIndex];
    }
  }

  // eslint-disable-next-line
  checkBoundaries(obj = {}) {
    if ( obj.settings.route && obj.settings.route.boundaries ) {
      if ( obj.settings.route.boundaries.top && obj.coords.y < obj.settings.route.boundaries.top ) {
        obj.state.direction = 'down';
        obj.state.directionChange = Math.floor(Math.random() * (this.gameState.state.measurements.gutterY * 1));
      } else if ( obj.settings.route.boundaries.bottom && obj.coords.y > obj.settings.route.boundaries.bottom ) {
        obj.state.direction = 'up';
        obj.state.directionChange = Math.floor(Math.random() * (this.gameState.state.measurements.gutterY * 1));
      } else if ( obj.settings.route.boundaries.left && obj.coords.x < obj.settings.route.boundaries.left ) {
        obj.state.direction = 'right';
        obj.state.directionChange = Math.floor(Math.random() * (this.gameState.state.measurements.gutterX * 1));
      } else if ( obj.settings.route.boundaries.right && obj.coords.x > obj.settings.route.boundaries.right ) {
        obj.state.direction = 'left';
        obj.state.directionChange = Math.floor(Math.random() * (this.gameState.state.measurements.gutterX * 1));
      }
    }
  }

  /**
   * HOW MUCH BIGGER A CATCH IS THAN THE 2D GAME DREW IT, and why there is a
   * number here at all.
   *
   * `checkCatch` builds two boxes by hand: five units either side of the ball,
   * and eleven across by eighteen deep around the player. Those were measured
   * against a player DRAWN AS A 20-UNIT LETTER, which is the same assumption
   * `collisionScale` exists to correct. At `figureScale` 2.2 the figure on
   * screen is 1.45m across and the box that decides whether he caught it is
   * 0.385m: he can be standing squarely under the ball with three quarters of
   * his body outside the only part of him that can catch.
   *
   * That is why so many passes fall incomplete, and it is not a fault of the
   * ported routes: the throw is aimed correctly, the receiver arrives, and a
   * box drawn for a letterform decides he did not reach it.
   *
   * SAME SHAPE AS `collisionScale`, deliberately. Injected on the settings
   * object rather than imported, defaulting to 1, which is the 2D game's own
   * behaviour and what a caller that knows nothing about this gets. The RATIO
   * between the two boxes is the port's and is not touched.
   */
  catchScale() {
    const s = this.settings && this.settings.catchScale;
    return typeof s === 'number' && s > 0 ? s : 1;
  }

  /**
   * HOW FAR THIS PARTICULAR BALL WAS THROWN, 0 to 1 across the falloff.
   *
   * A SHORT PASS AND A HAIL MARY ARE NOT THE SAME EVENT AND WERE BEING JUDGED
   * IDENTICALLY. `catchScale` was one number for every throw, so widening it to
   * stop short passes falling incomplete widened the bomb by exactly as much.
   * Measured before this: a throw past 26m still completed 52% of the time and
   * scored fifty on 27% of attempts, which makes the deep ball the obvious play
   * and turns a game meant to be WATCHED into one answer repeated ten times.
   *
   * The ramp is one number used twice, which is the whole idea: the further it
   * is thrown, the less of the field the receiver covers and the more the
   * defender does. Below `catchNear` nothing changes at all, so the short game
   * this was widened for is untouched.
   */
  throwStretch(obj = {}) {
    const c = obj.coords || {};
    if (c.startX === undefined || c.targetX === undefined) return 0;
    const near = this.settings && this.settings.catchNear;
    const far = this.settings && this.settings.catchFar;
    if (!(far > near)) return 0;
    const len = Math.hypot(c.targetX - c.startX, c.targetY - c.startY);
    const t = (len - near) / (far - near);
    return t < 0 ? 0 : (t > 1 ? 1 : t);
  }

  /** What the receiver's box is multiplied by at full stretch. 1 is no
   *  falloff, which is what a caller that says nothing gets. */
  catchFarScale() {
    const s = this.settings && this.settings.catchFarScale;
    return typeof s === 'number' && s > 0 ? s : 1;
  }

  /**
   * ...and how much of that a DEFENDER gets, as a fraction of it.
   *
   * A separate number because the two are not the same question. Widening the
   * catch alone would hand the secondary the same gift and turn every generous
   * pass into an interception, and interceptions are already the harshest
   * outcome on the ladder at minus ten. Defaults to 1, which is the ported
   * behaviour of both boxes being the same.
   */
  interceptShare() {
    const s = this.settings && this.settings.interceptShare;
    return typeof s === 'number' && s > 0 ? s : 1;
  }

  /**
   * HOW FAR A MAN IN THE AIR CAN REACH, in FIELD UNITS, and 0 for nobody.
   *
   * A jump is decided by the view, from the ball's real drawn arc and its real
   * distance, and it only fires when the ball is genuinely within reach of a
   * leaping receiver. That is a better answer to "can he get to it" than
   * anything in here, so while he is off the ground his box becomes this and
   * the promise the jump makes is the promise the catch keeps.
   *
   * Injected and defaulting to 0, which leaves the ported boxes exactly as they
   * were for a caller that never mentions jumping.
   */
  airborneReach() {
    const s = this.settings && this.settings.airborneReach;
    return typeof s === 'number' && s > 0 ? s : 0;
  }

  /** Is anybody off the ground right now? Nineteen objects, once a frame. */
  // eslint-disable-next-line
  anyoneAirborne(game = {}) {
    const list = (game && game.objects) || [];
    for (let i = 0; i < list.length; i += 1) {
      if (list[i].state && list[i].state.airborne) return true;
    }
    return false;
  }

  // eslint-disable-next-line
  checkCatch(obj = {}, game = {}) {
    const caughtByIndexList = [];
    const caughtByList = [];
    const caughtByPositionList = [];
    // The half-extents below are the 2D game's, unedited. The scale is applied
    // once where the boxes are built, exactly as `checkCollisions` does it.
    // THE SAME RAMP DOES BOTH: the receiver shrinks and the defender grows.
    const stretch = this.throwStretch(obj);
    const k = this.catchScale() * (1 + (this.catchFarScale() - 1) * stretch);
    const base = this.interceptShare();
    const share = base + (1 - base) * stretch;
    const set1 = {
      position: obj.settings.position,
      team: obj.settings.team,
      x: obj.coords.x,
      x1: (obj.coords.x - 5 * k),
      x2: (obj.coords.x + 5 * k),
      xSpeed: obj.state.xSpeed,
      y: obj.coords.y,
      y1: (obj.coords.y - 3 * k),
      y2: (obj.coords.y + 3 * k),
      ySpeed: obj.state.ySpeed,
      z: obj.coords.z
    }
    let i = 0;
    game.objects.forEach(object => {
      if ( ['ball', 'qb', 'x1', 'x2', 'x3', 'x4', 'x5', 'x6'].indexOf(object.settings.position) === -1 ) {
        // A defender reaches by his own share of it. The man the ball was
        // thrown at gets all of it.
        const g = object.settings.team === 1 ? k * share : k;
        /**
         * AND A MAN IN THE AIR IS A DIFFERENT SHAPE.
         *
         * The ported box is 11 units across and 18 deep, lopsided because it
         * wrapped a letterform drawn upward from its own baseline. Somebody who
         * has left his feet with both hands up has no baseline and no front: he
         * covers the same distance in every direction, which is what the view
         * measured before it let him jump.
         */
        // A LEAPING CATCH FALLS AWAY WITH THE THROW TOO. A receiver going up
        // for a bomb and just missing it is the picture of a failed hail mary,
        // and a guaranteed one would put the deep ball straight back where it
        // was.
        const air = object.state && object.state.airborne
            ? this.airborneReach() * (1 + (this.catchFarScale() - 1) * stretch) : 0;
        const set2 = air > 0 ? {
          position: object.settings.position,
          team: object.settings.team,
          x: object.coords.x,
          x1: (object.coords.x - air),
          x2: (object.coords.x + air),
          xSpeed: object.state.xSpeed,
          y: object.coords.y,
          y1: (object.coords.y - air),
          y2: (object.coords.y + air),
          ySpeed: object.state.ySpeed,
          z: object.coords.z
        } : {
          position: object.settings.position,
          team: object.settings.team,
          x: object.coords.x,
          x1: (object.coords.x - 5 * g),
          x2: (object.coords.x + 6 * g),
          xSpeed: object.state.xSpeed,
          y: object.coords.y,
          y1: (object.coords.y - 14 * g),
          y2: (object.coords.y + 4 * g),
          ySpeed: object.state.ySpeed,
          z: object.coords.z
        }
        /**
         * THE HEIGHT GATE, AND WHY A MAN IN THE AIR IS EXCUSED IT.
         *
         * `coords.z` is `getZIndex`, a ramp that climbs in half steps to a
         * clamp at 7, and this asked for the ball and the player to be on the
         * same step. Every player sits at 1 and never moves, so it meant "the
         * ball is back down".
         *
         * MEASURED, THAT IS WHAT REFUSES A LEAPING CATCH. On 166 jumps that
         * ended in no catch, the ball's index at its closest approach was a
         * median of 4.5 against his 1, and 88 of them would have been caught on
         * the boxes alone. The visitor watches a receiver leave his feet with
         * the ball half a metre away and come down with nothing.
         *
         * It is not re-tested for him because it has ALREADY been tested, and
         * better: view.js let him jump on the strength of the ball's real drawn
         * height against his own real reach, and the index is a proxy that
         * view.js itself stopped believing (see `arcHeight`). Asking it twice
         * would only overrule the accurate answer with the crude one.
         */
        const up = object.state && object.state.airborne;
        if ( (up || set1.z === set2.z) && (set2.team === 1 || set2.position === game.throwTo) ) {
          // Check left.
          if ( (set1.y1 >= set2.y1 && set1.y1 <= set2.y2) || (set1.y2 >= set2.y1 && set1.y2 <= set2.y2) ) {
            if ( set1.x1 <= set2.x2 && set1.x1 >= set2.x1 ) {
              if ( caughtByPositionList.indexOf(set2.position) === -1 ) {
                caughtByIndexList.push(i);
                caughtByList.push(set2);
                caughtByPositionList.push(set2.position);
              }
            }
          }
          // Check top.
          if ( (set1.x1 >= set2.x1 && set1.x1 <= set2.x2) || (set1.x2 >= set2.x1 && set1.x2 <= set2.x2) ) {
            if ( set1.y1 <= set2.y2 && set1.y1 >= set2.y1 ) {
              if ( caughtByPositionList.indexOf(set2.position) === -1 ) {
                caughtByIndexList.push(i);
                caughtByList.push(set2);
                caughtByPositionList.push(set2.position);
              }
            }
          }
          // Check bottom.
          if ( (set1.x1 >= set2.x1 && set1.x1 <= set2.x2) || (set1.x2 >= set2.x1 && set1.x2 <= set2.x2) ) {
            if ( set1.y2 >= set2.y1 && set1.y2 <= set2.y2 ) {
              if ( caughtByPositionList.indexOf(set2.position) === -1 ) {
                caughtByIndexList.push(i);
                caughtByList.push(set2);
                caughtByPositionList.push(set2.position);
              }
            }
          }
          // Check right.
          if ( (set1.y1 >= set2.y1 && set1.y1 <= set2.y2) || (set1.y2 >= set2.y1 && set1.y2 <= set2.y2) ) {
            if ( set1.x2 >= set2.x1 && set1.x2 <= set2.x2 ) {
              if ( caughtByPositionList.indexOf(set2.position) === -1 ) {
                caughtByIndexList.push(i);
                caughtByList.push(set2);
                caughtByPositionList.push(set2.position);
              }
            }
          }
        }
      }
      i += 1;
    });
    return this.handleCatchResult(game, caughtByList, caughtByIndexList, caughtByPositionList);
  }

  /**
   * HOW MUCH BIGGER THAN THE 2D GAME'S PLAYER THIS ONE IS.
   *
   * The half-extents in `checkCollisions` are the 2D game's, in field units,
   * and they are left exactly as written. What has changed is the player they
   * were written for: `config.figureScale` draws a figure at 2.2 times life
   * size, so a receiver was carrying a 0.21m collision radius inside a 0.73m
   * half-width and bodies passed through each other.
   *
   * INJECTED, NOT IMPORTED, for the reason audio is (D40): this file is
   * simulation and must not reach for config, or the physics stops being
   * testable with plain numbers. It arrives on the settings object the class is
   * already constructed with, and it defaults to 1, which is the 2D game's own
   * behaviour and what a caller that knows nothing about this will get.
   */
  collisionScale() {
    const s = this.settings && this.settings.collisionScale;
    return typeof s === 'number' && s > 0 ? s : 1;
  }

  /**
   * THE SPACE AROUND A PLAYER, IN FIELD UNITS, ADDED TO EVERY HALF-EXTENT.
   *
   * A SCALE ALONE CANNOT DO THIS, and that is the whole reason it exists. The
   * 2D game gives a lineman twice the half-extent of everybody else, but every
   * figure on this field is the same size, so any single multiplier that lifts
   * a receiver's box out to his own shoulders throws a lineman's box out to
   * twice that. Scale keeps the ported RATIO, and the pad sets the FLOOR.
   *
   * WHAT IT BUYS IS BLOCKING, not tidiness. A blocker whose engagement zone is
   * smaller than his own body is a blocker a defender walks through, so the
   * line never visibly holds anybody up and the offence rallying in front of a
   * carrier, which is most of what makes a short pass worth watching, does not
   * happen. Scaled but unpadded, a receiver's box reached 0.46m inside a 0.73m
   * half-width: he was 63% of himself.
   *
   * Injected the same way the scale is, and defaults to 0, which is the 2D
   * game's own behaviour.
   */
  collisionPad() {
    const p = this.settings && this.settings.collisionPad;
    return typeof p === 'number' && p > 0 ? p : 0;
  }

  // eslint-disable-next-line
  checkCollisions(obj = {}, game = {}) {
    // The switches below are the 2D game's, unedited. Scale and pad are applied
    // once where the boxes are built, rather than as eight edits to ported
    // constants for the same arithmetic.
    const k = this.collisionScale();
    const pad = this.collisionPad();
    let r1 = 6;
    let r2 = 6;
    let rx1 = r1;
    let rx2 = r2;
    switch ( obj.settings.position ) {
      case 'ball':
        r1 = 3;
        rx1 = 5;
        break;
      case 'x1':
      case 'x2':
      case 'x3':
      case 'x4':
      case 'x5':
      case 'x6':
        r1 = 12;
        rx1 = 10;
        break;
      default:
        r1 = 6;
        rx1 = 5;
        break;
    }
    const set1 = {
      hasBall: obj.state.hasBall,
      position: obj.settings.position,
      team: obj.settings.team,
      x: obj.coords.x,
      x1: (obj.coords.x - (rx1 * k + pad)),
      x2: (obj.coords.x + (rx1 * k + pad)),
      xSpeed: obj.state.xSpeed,
      y: obj.coords.y,
      y1: (obj.coords.y - (r1 * k + pad)),
      y2: (obj.coords.y + (r1 * k + pad)),
      ySpeed: obj.state.ySpeed
    }
    game.objects.forEach(object => {
      if ( obj.settings.position !== object.settings.position ) {
        switch ( object.settings.position ) {
          case 'ball':
            r2 = 3;
            rx2 = 5;
            break;
          case 'x1':
          case 'x2':
          case 'x3':
          case 'x4':
          case 'x5':
          case 'x6':
            // FIXED HERE, AND WORTH FIXING AT exesnohs.com TOO. The 2D source
            // assigns `r1` and `rx1` in this case, which are the OUTER
            // player's half-extents and were baked into `set1` before the loop
            // began. So the assignment reached nothing, `r2` and `rx2` kept
            // whatever the previous object in the list had left them at, and a
            // lineman standing in somebody's way was measured as a 6-unit
            // receiver, or as a 3-unit ball. It is the same shape of typo as
            // the jumbo1 multiply in formationRouteX4 (D18): a sibling case
            // copied and one character not changed.
            r2 = 12;
            rx2 = 10;
            break;
          default:
            r2 = 6;
            rx2 = 5;
            break;
        }
        const set2 = {
          hasBall: object.state.hasBall,
          position: object.settings.position,
          team: object.settings.team,
          x: object.coords.x,
          x1: (object.coords.x - (rx2 * k + pad)),
          x2: (object.coords.x + (rx2 * k + pad)),
          xSpeed: object.state.xSpeed,
          y: object.coords.y,
          y1: (object.coords.y - (r2 * k + pad)),
          y2: (object.coords.y + (r2 * k + pad)),
          ySpeed: object.state.ySpeed
        }
        if ( obj.state.xSpeed > 0 ) {
          this.checkCollisionsDownfield(obj, object, set1, set2);
        } else if ( obj.state.xSpeed < 0 ) {
          this.checkCollisionsUpfield(obj, object, set1, set2);
        } else {
          this.checkCollisionsDownfield(obj, object, set1, set2);
          this.checkCollisionsUpfield(obj, object, set1, set2);
        }
        if ( obj.state.ySpeed > 0 ) {
          this.checkCollisionsToRightSideline(obj, object, set1, set2);
        } else if ( obj.state.ySpeed < 0 ) {
          this.checkCollisionsToLeftSideline(obj, object, set1, set2);
        } else {
          this.checkCollisionsToRightSideline(obj, object, set1, set2);
          this.checkCollisionsToLeftSideline(obj, object, set1, set2);
        }
        // Check tackle.
        if ( (set1.x1 >= set2.x1 && set1.x1 <= set2.x2) || (set1.x2 >= set2.x1 && set1.x2 <= set2.x2) ) {
          if ( (set1.y1 >= set2.y1 && set1.y1 <= set2.y2) || (set1.y2 >= set2.y1 && set1.y2 <= set2.y2) ) {
            if ( set1.team !== set2.team ) {
              // Different team.
              if ( set1.hasBall ) {
                obj.state.tackle += 1;
                this.slowObject(obj, 0.1);
                if ( obj.state.tackle >= obj.settings.tackled ) {
                  this.gameState.state.tackled = true;
                }
              } else if ( set2.hasBall ) {
                object.state.tackle += 1;
                this.slowObject(object, 0.1);
                if ( object.state.tackle >= object.settings.tackled ) {
                  this.gameState.state.tackled = true;
                }
              }
            } else {
              // Same team.
              if ( set1.hasBall ) {
                obj.state.tackle -= 0.5;
                if ( obj.state.tackle < 0 ) {
                  obj.state.tackle = 0;
                }
              } else if ( set2.hasBall ) {
                object.state.tackle -= 0.5;
                if ( object.state.tackle < 0 ) {
                  object.state.tackle = 0;
                }
              }
            }
          }
        }
      }
    });
  }

  // eslint-disable-next-line
  checkCollisionsToRightSideline(obj = {}, object = {}, set1 = {}, set2 = {}) {
    if ( (set1.x1 >= set2.x1 && set1.x1 <= set2.x2) || (set1.x2 >= set2.x1 && set1.x2 <= set2.x2) ) {
      if ( set1.y2 >= set2.y1 && set1.y2 <= set2.y2 ) {
        if ( set1.team !== set2.team ) {
          if ( ['x', 'wr'].indexOf(obj.settings.positionGroup) !== -1 ) {
            this.audio.collide();
            obj.state.ySpeed = (obj.physics.maxSpeed * 0.4);
            object.state.ySpeed = 0;
            object.coords.y += obj.state.ySpeed;
          } else {
            obj.state.ySpeed = (obj.state.ySpeed * 0.2);
          }
          this.decelUpfield(obj);
          this.accelDownfield(obj);
        } else {
          if ( obj.settings.positionGroup !== object.settings.positionGroup ) {
            obj.state.ySpeed = (obj.state.ySpeed * 0.8);
          } else {
            obj.state.ySpeed = (obj.state.ySpeed * 0.2);
          }
          if ( set1.x <= set2.x ) {
            this.decelDownfield(obj);
            this.accelUpfield(obj);
          } else {
            this.decelUpfield(obj);
            this.accelDownfield(obj);
          }
        }
      }
    }
  }

  // eslint-disable-next-line
  checkCollisionsUpfield(obj = {}, object = {}, set1 = {}, set2 = {}) {
    if ( (set1.y1 >= set2.y1 && set1.y1 <= set2.y2) || (set1.y2 >= set2.y1 && set1.y2 <= set2.y2) ) {
      if ( set1.x1 <= set2.x2 && set1.x1 >= set2.x1 ) {
        if ( set1.team !== set2.team ) {
          if ( ['x', 'wr'].indexOf(obj.settings.positionGroup) !== -1 ) {
            this.audio.collide();
            obj.state.xSpeed = ((obj.physics.maxSpeed * 0.4) * -1);
            object.state.xSpeed = 0;
            object.coords.x -= obj.state.xSpeed;
          } else {
            obj.state.xSpeed = (obj.state.xSpeed * 0.2);
          }
          if ( set1.y <= set2.y ) {
            this.decelToRightSideline(obj);
            this.accelToLeftSideline(obj);
          } else {
            this.decelToLeftSideline(obj);
            this.accelToRightSideline(obj);
          }
        } else {
          if ( obj.settings.positionGroup !== object.settings.positionGroup ) {
            obj.state.xSpeed = (obj.state.xSpeed * 0.8);
          } else {
            obj.state.xSpeed = (obj.state.xSpeed * 0.2);
          }
          if ( set1.y <= set2.y ) {
            this.decelToRightSideline(obj);
            this.accelToLeftSideline(obj);
          } else {
            this.decelToLeftSideline(obj);
            this.accelToRightSideline(obj);
          }
        }
      }
    }
  }

  // eslint-disable-next-line
  checkCollisionsDownfield(obj = {}, object = {}, set1 = {}, set2 = {}) {
    if ( (set1.y1 >= set2.y1 && set1.y1 <= set2.y2) || (set1.y2 >= set2.y1 && set1.y2 <= set2.y2) ) {
      if ( set1.x2 >= set2.x1 && set1.x2 <= set2.x2 ) {
        if ( set1.team !== set2.team ) {
          if ( ['x', 'wr'].indexOf(obj.settings.positionGroup) !== -1 ) {
            this.audio.collide();
            obj.state.xSpeed = (obj.physics.maxSpeed * 0.4);
            object.state.xSpeed = 0;
            object.coords.x += obj.state.xSpeed;
          } else {
            obj.state.xSpeed = (obj.state.xSpeed * 0.2);
          }
          if ( set1.y <= set2.y ) {
            this.decelToRightSideline(obj);
            this.accelToLeftSideline(obj);
          } else {
            this.decelToLeftSideline(obj);
            this.accelToRightSideline(obj);
          }
        } else {
          if ( obj.settings.positionGroup !== object.settings.positionGroup ) {
            obj.state.xSpeed = (obj.state.xSpeed * 0.8);
          } else {
            obj.state.xSpeed = (obj.state.xSpeed * 0.2);
          }
          if ( set1.y <= set2.y ) {
            this.decelToRightSideline(obj);
            this.accelToLeftSideline(obj);
          } else {
            this.decelToLeftSideline(obj);
            this.accelToRightSideline(obj);
          }
        }
      }
    }
  }

  // eslint-disable-next-line
  checkCollisionsToLeftSideline(obj = {}, object = {}, set1 = {}, set2 = {}) {
    if ( (set1.x1 >= set2.x1 && set1.x1 <= set2.x2) || (set1.x2 >= set2.x1 && set1.x2 <= set2.x2) ) {
      if ( set1.y1 <= set2.y2 && set1.y1 >= set2.y1 ) {
        if ( set1.team !== set2.team ) {
          if ( ['x', 'wr'].indexOf(obj.settings.positionGroup) !== -1 ) {
            this.audio.collide();
            obj.state.ySpeed = ((obj.physics.maxSpeed * 0.4) * -1);
            object.state.ySpeed = 0;
            object.coords.y -= obj.state.ySpeed;
          } else {
            obj.state.ySpeed = (obj.state.ySpeed * 0.2);
          }
          this.decelUpfield(obj);
          this.accelDownfield(obj);
        } else {
          if ( obj.settings.positionGroup !== object.settings.positionGroup ) {
            obj.state.ySpeed = (obj.state.ySpeed * 0.8);
          } else {
            obj.state.ySpeed = (obj.state.ySpeed * 0.2);
          }
          if ( set1.x <= set2.x ) {
            this.decelDownfield(obj);
            this.accelUpfield(obj);
          } else {
            this.decelUpfield(obj);
            this.accelDownfield(obj);
          }
        }
      }
    }
  }

  // eslint-disable-next-line
  checkGutters(obj = {}) {
    const gutterValues = {
      bottom: this.gameState.state.measurements.height,
      left: 0,
      right: this.gameState.state.measurements.width,
      top: 0,
    };
    if ( obj.coords.y < gutterValues.top ) {
      obj.state.direction = 'down';
      obj.state.directionChange = Math.floor(Math.random() * (this.gameState.state.measurements.gutterY * 2));
    } else if ( obj.coords.y > gutterValues.bottom ) {
      obj.state.direction = 'up';
      obj.state.directionChange = Math.floor(Math.random() * (this.gameState.state.measurements.gutterY * 2));
    } else if ( obj.coords.x < gutterValues.left ) {
      obj.state.direction = 'right';
      obj.state.directionChange = Math.floor(Math.random() * (this.gameState.state.measurements.gutterX * 2));
    } else if ( obj.coords.x > gutterValues.right ) {
      obj.state.direction = 'left';
      obj.state.directionChange = Math.floor(Math.random() * (this.gameState.state.measurements.gutterX * 2));
    }
  }

  // eslint-disable-next-line
  checkWrBoundaries(obj = {}) {
    const xMulti = 3;
    const yMulti = 3;
    const boundaries = obj.settings.route.boundaries;
    if ( boundaries && boundaries.right ) {
      const rightDist = (boundaries.right - obj.coords.x);
      if ( rightDist < (this.settings.style.gutters.x * xMulti)) {
        this.decelDownfield(obj);
        this.accelUpfield(obj);
      }
    }
    if ( boundaries && boundaries.left ) {
      const leftDist = (obj.coords.x - boundaries.left);
      if ( leftDist < (boundaries.left * xMulti)) {
        this.decelUpfield(obj);
        this.accelDownfield(obj);
      }
    }
    if ( boundaries && boundaries.top ) {
      const topDist = (obj.coords.y - boundaries.top);
      if ( topDist < (this.settings.style.gutters.y * yMulti)) {
        this.decelToLeftSideline(obj);
        this.accelToRightSideline(obj);
      }
    }
    if ( boundaries && boundaries.bottom ) {
      const bottomDist = (boundaries.bottom - obj.coords.y);
      if ( bottomDist < (this.settings.style.gutters.y * yMulti)) {
        this.decelToRightSideline(obj);
        this.accelToLeftSideline(obj);
      }
    }
  }

  // eslint-disable-next-line
  correctBoundaryOverruns(obj) {
    const overruns = this.getBoundaryOverruns(obj);
    overruns.forEach((side) => {
      switch (side) {
        case 'bottom':
          this.decelToRightSideline(obj);
          this.accelToLeftSideline(obj);
          if ( Math.abs(obj.state.ySpeed) < (obj.physics.accel * 2) ) {
            obj.state.ySpeed = 0;
          }
          break;
        case 'left':
          this.decelUpfield(obj);
          this.accelDownfield(obj);
          if ( Math.abs(obj.state.ySpeed) < (obj.physics.accel * 2) ) {
            obj.state.ySpeed = 0;
          }
          break;
        case 'right':
          this.decelDownfield(obj);
          this.accelUpfield(obj);
          if ( Math.abs(obj.state.ySpeed) < (obj.physics.accel * 2) ) {
            obj.state.ySpeed = 0;
          }
          break;
        case 'top':
          this.decelToLeftSideline(obj);
          this.accelToRightSideline(obj);
          if ( Math.abs(obj.state.ySpeed) < (obj.physics.accel * 2) ) {
            obj.state.ySpeed = 0;
          }
          break;
        default:
          break;
      }
    });
  }

  // eslint-disable-next-line
  decelToRightSideline(obj = {}, multi = 1) {
    if ( typeof(multi) === 'undefined' ) {
      multi = 1;
    }
    if ( obj.state.ySpeed > 0 ) {
      obj.state.ySpeed -= (obj.physics.decel * multi);
      if ( obj.state.ySpeed < 0 ) {
        obj.state.ySpeed = 0;
      }
    }
  }

  // eslint-disable-next-line
  decelUpfield(obj = {}, multi = 1) {
    if ( typeof(multi) === 'undefined' ) {
      multi = 1;
    }
    if ( obj.state.xSpeed < 0 ) {
      obj.state.xSpeed += (obj.physics.decel * multi);
      if ( obj.state.xSpeed > 0 ) {
        obj.state.xSpeed = 0;
      }
    }
  }

  // eslint-disable-next-line
  decelDownfield(obj = {}, multi = 1) {
    if ( typeof(multi) === 'undefined' ) {
      multi = 1;
    }
    if ( obj.state.xSpeed > 0 ) {
      obj.state.xSpeed -= (obj.physics.decel * multi);
      if ( obj.state.xSpeed < 0 ) {
        obj.state.xSpeed = 0;
      }
    }
  }

  // eslint-disable-next-line
  decelToLeftSideline(obj = {}, multi = 1) {
    if ( typeof(multi) === 'undefined' ) {
      multi = 1;
    }
    if ( obj.state.ySpeed < 0 ) {
      obj.state.ySpeed += (obj.physics.decel * multi);
      if ( obj.state.ySpeed > 0 ) {
        obj.state.ySpeed = 0;
      }
    }
  }

  // eslint-disable-next-line
  decelX(obj = {}) {
    if ( obj.state.xSpeed > 0 ) {
      obj.state.xSpeed -= obj.physics.decel;
      if ( obj.state.xSpeed < 0 ) {
        obj.state.xSpeed = 0;
      }
    } else if ( obj.state.xSpeed < 0 ) {
      obj.state.xSpeed += obj.physics.decel;
      if ( obj.state.xSpeed > 0 ) {
        obj.state.xSpeed = 0;
      }
    }
  }

  // eslint-disable-next-line
  decelY(obj = {}) {
    if ( obj.state.ySpeed > 0 ) {
      obj.state.ySpeed -= obj.physics.decel;
      if ( obj.state.ySpeed < 0 ) {
        obj.state.ySpeed = 0;
      }
    } else if ( obj.state.ySpeed < 0 ) {
      obj.state.ySpeed += obj.physics.decel;
      if ( obj.state.ySpeed > 0 ) {
        obj.state.ySpeed = 0;
      }
    }
  }

  // eslint-disable-next-line
  getBoundaryOverruns(obj = {}) {
    const overruns = [];
    if ( obj.settings.route && obj.settings.route.boundaries ) {
      if ( obj.settings.route.boundaries.top && obj.coords.y < obj.settings.route.boundaries.top ) {
        overruns.push('top');
      }
      if ( obj.settings.route.boundaries.bottom && obj.coords.y > obj.settings.route.boundaries.bottom ) {
        overruns.push('bottom');
      }
      if ( obj.settings.route.boundaries.left && obj.coords.x < obj.settings.route.boundaries.left ) {
        overruns.push('left');
      }
      if ( obj.settings.route.boundaries.right && obj.coords.x > obj.settings.route.boundaries.right ) {
        overruns.push('right');
      }
    }
    return overruns;
  }

  // eslint-disable-next-line
  getEvadeBoundaryDirection(obj = {}) {
    let direction = null;
    if ( obj.coords.y < obj.settings.route.boundaries.top ) {
      direction = 'down';
    } else if ( obj.coords.y > obj.settings.route.boundaries.bottom ) {
      direction = 'up';
    } else if ( obj.coords.x < obj.settings.route.boundaries.left ) {
      direction = 'right';
    } else if ( obj.coords.x > obj.settings.route.boundaries.right ) {
      direction = 'left';
    }
    return direction;
  }

  /**
   * Quadrant layout (clockwise from top left):
   *
   * 12
   * 43
   *
   * @param {*} fromObj
   * @param {*} otherObj
   */
  // eslint-disable-next-line
  getTargetQuadrant(fromObj, otherObj) {
    let quad = 0;
    if ( otherObj.coords.x <= fromObj.coords.x ) {
      // Left or center x.
      if ( otherObj.coords.y <= fromObj.coords.y ) {
        // High or center y.
        quad = 1;
      } else {
        // Low y.
        quad = 4;
      }
    } else {
      // Right x.
      if ( otherObj.coords.y <= fromObj.coords.y ) {
        // High or center y.
        quad = 2;
      } else {
        // Low y.
        quad = 3;
      }
    }
    return quad;
  }

  // eslint-disable-next-line
  handleCatchResult(game = {}, caughtByList = [], caughtByIndexList = [], caughtByPositionList = []) {
    let caught = false;
    // Check catches.
    if ( caughtByList.length > 0 ) {
      const firstCatch = caughtByList[0];
      const firstIndex = caughtByIndexList[0];
      caught = true;
      this.gameState.state.ball.caught = true;
      this.audio.catch();
      this.gameState.state.ball.position = firstCatch.position;
      this.gameState.state.ball.team = firstCatch.team;
      if ( typeof(game.objects[firstIndex]) !== 'undefined' ) {
        game.objects[firstIndex].state.hasBall = true;
      }
      if ( firstCatch.team === 0 ) {
        if (
          typeof(game.objects[firstIndex].settings.route) !== 'undefined' &&
          typeof(game.objects[firstIndex].settings.route.boundaries) !== 'undefined'
        ) {
          game.objects[firstIndex].settings.route.boundaries.bottom = this.gameState.state.measurements.height;
          game.objects[firstIndex].settings.route.boundaries.left = (this.gameState.state.measurements.lineInterval * 1);
          game.objects[firstIndex].settings.route.boundaries.right = (this.gameState.state.measurements.lineInterval * 5);
          game.objects[firstIndex].settings.route.boundaries.top = (this.gameState.state.measurements.gutterY * 2);
        }
        // game.objects[firstIndex].state.xSpeed = game.objects[firstIndex].physics.maxSpeed;
        // game.objects[firstIndex].state.ySpeed = 0;
      } else if ( firstCatch.team === 1 ) {
        // Interception.
        this.gameState.state.anim.done = true;
      }
    }
    return caught;
  }

  // eslint-disable-next-line
  moveBallObject(obj = {}, game = {}) {
    // THE CEILING IS ABOVE EVERY REACH BELOW IT, so it has to lift too: the 2D
    // game stops asking about a catch once the ball is above index 2, and a
    // leaping receiver whose question is never asked cannot answer it.
    if ( obj.coords.z < 2 || this.anyoneAirborne(game) ) {
      this.checkCatch(obj, game);
    }
    obj.coords.x = (obj.coords.x + obj.state.xSpeed);
    obj.coords.y = (obj.coords.y + obj.state.ySpeed);
  }

  // eslint-disable-next-line
  moveObject(obj = {}, game = {}) {
    this.checkCollisions(obj, game);
    obj.coords.x = (obj.coords.x + obj.state.xSpeed);
    obj.coords.y = (obj.coords.y + obj.state.ySpeed);
  }

  // eslint-disable-next-line
  runAround(obj = {}, game = {}) {
    this.setObjectDirection(obj);
    this.checkBoundaries(obj);
    this.checkGutters(obj);
    switch ( obj.state.direction ) {
      case 'down':
        this.accelToRightSideline(obj);
        this.decelX(obj);
        break;
      case 'left':
        this.accelUpfield(obj);
        this.decelY(obj);
        break;
      case 'right':
        this.accelDownfield(obj);
        this.decelY(obj);
        break;
      case 'up':
        this.accelToLeftSideline(obj);
        this.decelX(obj);
        break;
      default:
        break;
    }
    this.moveObject(obj, game);
  }

  // eslint-disable-next-line
  runFrom(obj = {}, targetX = 0, targetY = 0) {
    const height = this.gameState.state.measurements.height;
    const yInterval = (height / 14);
    const xSize = 30;
    const ySize = 16;
    const x = (obj.coords.x + obj.state.xSpeed);
    const y = (obj.coords.y + obj.state.ySpeed);
    const ox2 = x + xSize;
    const tx1 = targetX - xSize;
    const oy1 = y - ySize;
    const oy2 = y + ySize;
    const ty1 = targetY - ySize;
    const ty2 = targetY + ySize;
    if ( targetY > y ) {
      if ( obj.coords.y >= (yInterval * 1) ) {
        this.decelToRightSideline(obj);
        this.accelToLeftSideline(obj, 2);
      } else {
        this.decelToLeftSideline(obj);
        this.accelToRightSideline(obj, 2);
      }
    } else {
      if ( obj.coords.y <= Math.round(yInterval * 13) ) {
        this.decelToLeftSideline(obj);
        this.accelToRightSideline(obj, 2);
      } else {
        this.decelToRightSideline(obj);
        this.accelToLeftSideline(obj, 2);
      }
    }
    if ( (tx1 > ox2) && ((ty1 > oy1 && ty1 < oy2) || (ty2 > oy1 && ty2 < oy2 )) ) {
      this.decelDownfield(obj);
      // this.accelUpfield(obj);
    } else {
      this.decelUpfield(obj);
      this.accelDownfield(obj);
    }
  }

  // eslint-disable-next-line
  runTo(obj = {}, targetX = 0, targetY = 0) {
    if ( obj.coords.x > targetX ) {
      this.accelUpfield(obj);
    } else if ( obj.coords.x < targetX ) {
      this.accelDownfield(obj);
    } else {
      obj.coords.x = targetX;
    }
    if ( obj.coords.y < targetY ) {
      this.accelToRightSideline(obj);
    } else if ( obj.coords.y > targetY ) {
      this.accelToLeftSideline(obj);
    } else {
      obj.coords.y = targetY;
    }
  }

  // eslint-disable-next-line
  runToBall(obj = {}, ball = {}) {
    if ( obj.coords.x > ball.coords.targetX ) {
      this.accelUpfield(obj);
    } else if ( obj.coords.x < ball.coords.targetX ) {
      this.accelDownfield(obj);
    } else {
      obj.coords.x = ball.coords.targetX;
    }
    if ( obj.coords.y < ball.coords.targetY ) {
      this.accelToRightSideline(obj);
    } else if ( obj.coords.y > ball.coords.targetY ) {
      this.accelToLeftSideline(obj);
    } else {
      obj.coords.y = ball.coords.targetY;
    }
  }

  // eslint-disable-next-line
  setObjectDirection(obj = {}) {
    if ( obj.state.directionChange ) {
      obj.state.directionChange -= 1;
    } else {
      this.changeDirection(obj);
      obj.state.directionChange = Math.floor(Math.random() * 75);
    }
  }

  // eslint-disable-next-line
  slowObject(obj = {}, int = 0.1) {
    if ( obj.state.xSpeed > 0 ) {
      obj.state.xSpeed -= int;
    } else if ( obj.state.xSpeed < 0 ) {
      obj.state.xSpeed += int;
    }
    if ( obj.state.ySpeed > 0 ) {
      obj.state.ySpeed -= int;
    } else if ( obj.state.ySpeed < 0 ) {
      obj.state.ySpeed += int;
    }
  }

  // eslint-disable-next-line
  slowObjectDown(obj = {}, int = 0.1) {
    obj.state.ySpeed -= int;
    if ( obj.state.ySpeed < 0 ) {
      obj.state.ySpeed = 0;
    }
  }

  // eslint-disable-next-line
  slowObjectUp(obj = {}, int = 0.1) {
    obj.state.ySpeed += int;
    if ( obj.state.ySpeed > 0 ) {
      obj.state.ySpeed = 0;
    }
  }

  // eslint-disable-next-line
  slowObjectX(obj = {}, int = 0.1) {
    if ( obj.state.xSpeed > 0 ) {
      obj.state.xSpeed -= int;
    } else if ( obj.state.xSpeed < 0 ) {
      obj.state.xSpeed += int;
    }
  }

  // eslint-disable-next-line
  slowObjectY(obj = {}, int = 0.1) {
    if ( obj.state.ySpeed > 0 ) {
      obj.state.ySpeed -= int;
    } else if ( obj.state.ySpeed < 0 ) {
      obj.state.ySpeed += int;
    }
  }
}
