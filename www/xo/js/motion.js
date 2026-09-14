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

  /**
   * HOW CLOSE TO HIS LINE COUNTS AS ON IT, IN FIELD UNITS. 0 IS THE PORT.
   *
   * EVERY STEER IN THIS FILE AND IN routes.js IS THE SAME TWO-WAY TEST: if the
   * coordinate is below the target accelerate one way, if it is above it
   * accelerate the other. There is no third branch, so NOTHING EVER
   * DECELERATES, and that is not a rounding problem. It is an undamped
   * oscillator: acceleration always opposes displacement and nothing ever
   * removes energy, so whatever lateral speed a player carries when he first
   * crosses his line is conserved for the rest of the play.
   *
   * MEASURED ON THE STEERING LAW ALONE, one man, no collisions, no defenders:
   * a receiver nudged one unit off a straight go route never returns to it. He
   * limit-cycles forever, and the cycle is set by the speed he arrived with:
   *
   *     arrives with 0.40 -> settles into +/-0.40 units, |vy| up to 0.40
   *     arrives with 1.00 -> settles into +/-1.80 units, |vy| up to 1.00
   *     arrives with 2.15 -> settles into +/-6.40 units, |vy| up to 2.15
   *
   * The last of those is his FULL TOP SPEED, sideways, reversing every 11
   * frames, for as long as he runs. That is the squiggle: a man asked to run
   * straight who is really sprinting left, then right, then left again, and who
   * only looks like he is going straight because the excursion is 0.22m.
   *
   * IT IS ALSO THE THROW, AND THAT IS THE EXPENSIVE HALF. `generateBallObject`
   * leads the pass off the receiver's ySpeed AT THE INSTANT the visitor pressed
   * the button, multiplied by as much as 45. Sampling a full-speed square wave
   * once, the same receiver on the same straight route is led anywhere from
   * 0.08m to 3.78m sideways depending only on which frame of the cycle the tap
   * landed on. See `state.heading` in play.js for the other half of this.
   *
   * WHAT THE THIRD BRANCH IS. Inside the band he is on his line, so the steer
   * stops asking for a correction and BLEEDS the lateral speed instead, which
   * is the energy the cycle was living on. Outside it he accelerates as he
   * always did, and brakes if he is closing faster than `decel` could stop him
   * in the distance that is left. `decel` is 1.5 against an accel of 0.4, so a
   * man who reaches the band at top speed stops within 3 units of its edge and
   * runs straight from there.
   *
   * INJECTED AND DEFAULTING TO 0, like `collisionScale` and `rushShed` before
   * it, and at 0 every steer below is the 2D game's two-way test exactly.
   */
  steerDeadband() {
    const d = this.settings && this.settings.steerDeadband;
    return typeof d === 'number' && d > 0 ? d : 0;
  }

  /**
   * ONE AXIS OF A DAMPED STEER. `pos` and `target` are that axis's coordinate,
   * `speed` its velocity, and the four callbacks are the accel and decel pair
   * this file already has for it. It is written this way because the x and y
   * pairs are not symmetrical in naming (downfield/upfield against
   * right/left), and a shared law that reaches for the names directly would
   * have to know which axis it is on twice over.
   */
  // eslint-disable-next-line
  steerAxis(obj, pos, target, speed, accelUp, accelDown, bleed) {
    const dead = this.steerDeadband();
    // 0 IS THE PORT, and it is an early return rather than a band of zero
    // width so that "off" means the ported code path, not a narrower version
    // of the new one.
    if (!(dead > 0)) {
      if (pos < target) accelUp();
      else if (pos > target) accelDown();
      return false;
    }
    const err = target - pos;
    // On his line. Stop asking for a correction and take the energy out.
    if (Math.abs(err) <= dead) {
      bleed();
      return true;
    }
    // Closing faster than he can stop in what is left. Brake, do not steer.
    const d = obj.physics && obj.physics.decel > 0 ? obj.physics.decel : 0;
    if (d > 0 && speed * err > 0 && (speed * speed) >= (2 * d * (Math.abs(err) - dead))) {
      bleed();
      return true;
    }
    if (err > 0) accelUp();
    else accelDown();
    return false;
  }

  /** The damped replacement for the bare `y < target ? right : left` pair.
   *  Used by every route in routes.js that holds a man on a line. */
  // eslint-disable-next-line
  steerToY(obj = {}, yTarget = 0) {
    return this.steerAxis(
      obj, obj.coords.y, yTarget, obj.state.ySpeed,
      () => this.accelToRightSideline(obj),
      () => this.accelToLeftSideline(obj),
      () => this.decelY(obj)
    );
  }

  /** ...and the same for the downfield axis. */
  // eslint-disable-next-line
  steerToX(obj = {}, xTarget = 0) {
    return this.steerAxis(
      obj, obj.coords.x, xTarget, obj.state.xSpeed,
      () => this.accelDownfield(obj),
      () => this.accelUpfield(obj),
      () => this.decelX(obj)
    );
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
    // The ported `else obj.coords.x = xTarget` branches are gone with no change
    // of behaviour: they only ran on exact equality, where they assigned a
    // coordinate the value it already held. See `steerDeadband`.
    this.steerToX(obj, xTarget);
    this.steerToY(obj, yTarget);
  }

  // eslint-disable-next-line
  accelToBall(obj = {}, ball = {}) {
    // THIS ONE ALREADY HALF-DAMPED ITSELF, and the decel-assisted turn is kept:
    // it kills the speed going the wrong way at `decel` before adding any the
    // right way, which is what makes chasing a ball feel sharper than running a
    // route. What it still had no branch for is ARRIVING, so it is the same
    // deadband and the same brake as every other steer, wrapped round the pair.
    this.steerAxis(
      obj, obj.coords.x, ball.coords.targetX, obj.state.xSpeed,
      () => { this.decelUpfield(obj); this.accelDownfield(obj); },
      () => { this.decelDownfield(obj); this.accelUpfield(obj); },
      () => this.decelX(obj)
    );
    this.steerAxis(
      obj, obj.coords.y, ball.coords.targetY, obj.state.ySpeed,
      () => { this.decelToLeftSideline(obj); this.accelToRightSideline(obj); },
      () => { this.decelToRightSideline(obj); this.accelToLeftSideline(obj); },
      () => this.decelY(obj)
    );
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

  /**
   * ...AND HOW MUCH OF HIS OWN DOUBLE-SIZED BOX A LINEMAN KEEPS.
   *
   * The 2D game gives an offensive lineman half-extents of 12 by 10 against
   * everybody else's 6 by 5: exactly twice the man. That is what makes the line
   * hold, and QA round twenty-four says it holds TOO WELL, with a blitzer never
   * really reaching the quarterback.
   *
   * A SEPARATE NUMBER BECAUSE IT IS A SEPARATE QUESTION. `collisionScale`
   * corrects every box on the field for a figure drawn at 2.2 times life size
   * and must not move: shrinking that to loosen the line would walk receivers
   * and defenders through each other as well, which is the fault it was added
   * to fix. This one touches the lineman's own ported doubling and nothing
   * else, so the request "the offensive line only" is what the code says.
   *
   * Injected and defaulting to 1, which is the ported behaviour.
   */
  linemanScale() {
    const s = this.settings && this.settings.linemanScale;
    return typeof s === 'number' && s > 0 ? s : 1;
  }

  // eslint-disable-next-line
  checkCollisions(obj = {}, game = {}) {
    // The switches below are the 2D game's, unedited. Scale and pad are applied
    // once where the boxes are built, rather than as eight edits to ported
    // constants for the same arithmetic.
    const k = this.collisionScale();
    const pad = this.collisionPad();
    // The lineman's own doubling, and his alone. See `linemanScale`.
    const L = this.linemanScale();
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
        r1 = 12 * L;
        rx1 = 10 * L;
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
      // IS THIS PASS PROTECTION? Carried on the pair rather than passed as a
      // fifth argument to four ported functions. See `shedFor`.
      pocket: !game.runForYourLife && !game.throwTo,
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
            r2 = 12 * L;
            rx2 = 10 * L;
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

  /**
   * HOW MUCH OF A BLITZER'S DRIVE SURVIVES CONTACT WITH A BLOCKER.
   *
   * THE WALL IS NOT A BOX SIZE, IT IS A ONE-SIDED SHOVE, and finding that took
   * a whole round of measuring boxes. The four `checkCollisions*` responders
   * below treat a blocker and a defender completely differently when they meet:
   * the blocker (`positionGroup` x or wr) is set to 40% of his own TOP speed
   * and then DISPLACES the other man, `object.coords.x += obj.state.xSpeed`,
   * after zeroing his speed outright. The defender, on his own pass through the
   * same pair, merely keeps 20% of whatever speed he had.
   *
   * So a rusher who meets a lineman is stopped dead, pushed backwards, and
   * damped to a fifth, every frame, for the whole play. Measured over 133
   * plays, on 95% of the frames a blitzer made no progress toward the
   * quarterback there was a blocker in the corridor between them. That is the
   * 2D game's own arithmetic and it is what makes blocking work for the run,
   * which is the half of it worth keeping: a blocker SHOVES and a rusher never
   * SHEDS.
   *
   * This is the shed, and it is deliberately narrow. It applies only to a man
   * whose route says `blitz`, so it is the designed pass rush that gets to
   * fight through and nothing else on the field changes: a lineman still walls
   * off a defender in coverage exactly as he did.
   *
   * 0 is the ported behaviour and the default. 1 would be a blocker nobody can
   * feel. Injected, like every other setting this class has been given.
   */
  rushShed() {
    const s = this.settings && this.settings.rushShed;
    return typeof s === 'number' && s > 0 ? (s > 1 ? 1 : s) : 0;
  }

  /**
   * ...AND IT IS ONLY THE BLITZ, AND ONLY IN THE POCKET.
   *
   * `pocket` is "the quarterback still has it and has neither thrown it nor
   * taken off", which is pass protection and nothing else. THE SCOPE IS THE
   * WHOLE DESIGN. A blitz route runs at whoever has the ball, so on a running
   * play a shedding blitzer is shedding the blocks in front of the CARRIER, and
   * measured that way the run game lost 18% of its points: 17.5 a play down to
   * 14.3, with the screen from 28.2 to 21.1. Those plays are the ones this game
   * is really about, and the pass rush is not worth them.
   *
   * A blocker still shoves exactly as the 2D game shoves, everywhere else on
   * the field and on every running play.
   */
  // eslint-disable-next-line
  shedFor(object = {}, pocket = false) {
    if (!pocket) return 0;
    const route = object.settings && object.settings.route;
    return route && route.type === 'blitz' ? this.rushShed() : 0;
  }

  /**
   * ...AND THE SAME SHED POINTING THE OTHER WAY, FOR A MAN BREAKING FREE.
   *
   * `rushShed` is a blitzer fighting through a blocker. This is a receiver
   * fighting through a DEFENDER who has been hanging on him, and it exists
   * because the ported response has no way out of itself: a non-lineman's box
   * reaches 1.76m between two men while `play.separate` rests them at 1.45m, so
   * anybody running alongside anybody is colliding on every frame and the
   * receiver's speed is hard-set to 40% of his top speed forever. Measured over
   * 340 plays, 1.37 locks a play last two seconds or longer.
   *
   * WHO IS BREAKING FREE IS NOT DECIDED HERE. `play.breakContact` owns the
   * clock, the two seconds, the cooldown and the impulse, and writes a plain
   * `state.escape` on a plain object. This file only asks whether the flag is
   * set, which keeps the rule about what a port may know intact: motion.js
   * still has no idea what a juke is.
   *
   * Injected and defaulting to 0, which is the ported behaviour for a caller
   * that never mentions it.
   */
  escapeShove() {
    const s = this.settings && this.settings.escapeShove;
    return typeof s === 'number' && s > 0 ? (s > 1 ? 1 : s) : 0;
  }

  /** Is this man mid-break, and from whom? A break frees him from the man he
   *  is breaking from and from nobody else, so a receiver who beats his corner
   *  can still be brought down by the safety arriving. */
  // eslint-disable-next-line
  escapingFrom(obj = {}, object = {}) {
    const e = obj.state && obj.state.escape;
    if (!e) return 0;
    const from = object.settings && object.settings.position;
    return e.against === from ? this.escapeShove() : 0;
  }

  /**
   * WHAT A MAN'S SPEED BECOMES ON CONTACT, on whichever axis the caller is
   * resolving. `clamped` is the 2D game's own answer, 40% of his top speed in
   * the direction of the hit, and it is what makes a block a block. A man
   * breaking free of THIS opponent keeps the speed he already had instead,
   * which is the whole mechanic: he is no longer being slowed by somebody he
   * has just beaten.
   */
  // eslint-disable-next-line
  contactSpeed(obj = {}, object = {}, clamped = 0, current = 0) {
    const free = this.escapingFrom(obj, object);
    return free > 0 ? (current * free) + (clamped * (1 - free)) : clamped;
  }

  // eslint-disable-next-line
  checkCollisionsToRightSideline(obj = {}, object = {}, set1 = {}, set2 = {}) {
    if ( (set1.x1 >= set2.x1 && set1.x1 <= set2.x2) || (set1.x2 >= set2.x1 && set1.x2 <= set2.x2) ) {
      if ( set1.y2 >= set2.y1 && set1.y2 <= set2.y2 ) {
        if ( set1.team !== set2.team ) {
          if ( ['x', 'wr'].indexOf(obj.settings.positionGroup) !== -1 ) {
            this.audio.collide();
            // ...AND A MAN BREAKING FREE KEEPS HIS OWN. See `contactSpeed`.
            obj.state.ySpeed = this.contactSpeed(obj, object,
              (obj.physics.maxSpeed * 0.4), obj.state.ySpeed);
            // A BLITZER FIGHTS THROUGH IT. See `rushShed`: at 0 this is the
            // ported shove exactly, a dead stop and a shove backwards.
            const shed = this.shedFor(object, set1.pocket);
            object.state.ySpeed = (object.state.ySpeed * shed);
            object.coords.y += obj.state.ySpeed * (1 - shed);
          } else {
            obj.state.ySpeed = (obj.state.ySpeed * (0.2 + 0.8 * this.shedFor(obj, set1.pocket)));
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
            // ...AND A MAN BREAKING FREE KEEPS HIS OWN. See `contactSpeed`.
            obj.state.xSpeed = this.contactSpeed(obj, object,
              ((obj.physics.maxSpeed * 0.4) * -1), obj.state.xSpeed);
            // A BLITZER FIGHTS THROUGH IT. See `rushShed`: at 0 this is the
            // ported shove exactly, a dead stop and a shove backwards.
            const shed = this.shedFor(object, set1.pocket);
            object.state.xSpeed = (object.state.xSpeed * shed);
            object.coords.x -= obj.state.xSpeed * (1 - shed);
          } else {
            obj.state.xSpeed = (obj.state.xSpeed * (0.2 + 0.8 * this.shedFor(obj, set1.pocket)));
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
            // ...AND A MAN BREAKING FREE KEEPS HIS OWN. See `contactSpeed`.
            obj.state.xSpeed = this.contactSpeed(obj, object,
              (obj.physics.maxSpeed * 0.4), obj.state.xSpeed);
            // A BLITZER FIGHTS THROUGH IT. See `rushShed`: at 0 this is the
            // ported shove exactly, a dead stop and a shove backwards.
            const shed = this.shedFor(object, set1.pocket);
            object.state.xSpeed = (object.state.xSpeed * shed);
            object.coords.x += obj.state.xSpeed * (1 - shed);
          } else {
            obj.state.xSpeed = (obj.state.xSpeed * (0.2 + 0.8 * this.shedFor(obj, set1.pocket)));
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
            // ...AND A MAN BREAKING FREE KEEPS HIS OWN. See `contactSpeed`.
            obj.state.ySpeed = this.contactSpeed(obj, object,
              ((obj.physics.maxSpeed * 0.4) * -1), obj.state.ySpeed);
            // A BLITZER FIGHTS THROUGH IT. See `rushShed`: at 0 this is the
            // ported shove exactly, a dead stop and a shove backwards.
            const shed = this.shedFor(object, set1.pocket);
            object.state.ySpeed = (object.state.ySpeed * shed);
            object.coords.y -= obj.state.ySpeed * (1 - shed);
          } else {
            obj.state.ySpeed = (obj.state.ySpeed * (0.2 + 0.8 * this.shedFor(obj, set1.pocket)));
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
    this.steerToX(obj, targetX);
    this.steerToY(obj, targetY);
  }

  // eslint-disable-next-line
  runToBall(obj = {}, ball = {}) {
    this.steerToX(obj, ball.coords.targetX);
    this.steerToY(obj, ball.coords.targetY);
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
