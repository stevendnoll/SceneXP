// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * formations.js - Where every player stands, and the route each one runs.
 *
 * PORTED FROM THE 2D GAME, DELIBERATELY UNCHANGED (D2). This is 144KB of
 * hand-tuned football that already works, and the whole argument of the port
 * is that it does not need rewriting: positions here are not fixed pixels,
 * they are formulas over field measurements. Feed those measurements in world
 * metres instead of canvas pixels and the same expressions place players on a
 * 3D field. See PLANNING section 4.
 *
 * The only edits made were mechanical: TypeScript annotations stripped (32
 * `: any`, one `: number`, six class property declarations) and the class
 * exported as an ES module. No formation, no route and no number was touched.
 * Diff it against specs/exesnohs2d/src/classes/formations.class.tsx if you ever
 * doubt that.
 *
 * IT IMPORTS NOTHING AND TOUCHES NO GLOBAL. No THREE, no document, no window
 * (`state.window` is a plain object handed in by the caller, not the browser's).
 * That is the rule the whole architecture rests on, because the test stub
 * absorbs anything written onto a mesh, so only code shaped like this can be
 * tested at all.
 *
 * THREE INPUTS DECIDE EVERY COORDINATE, and they have to agree with the field
 * the markings were painted on:
 *
 *   1. `gameState.state.measurements.height`  the sideline-to-sideline extent
 *   2. `settings.style.gutters.{x,y}`         the unit everything is counted in
 *   3. `setContainerDimensions(h, w, gx, gy)` from which the routes derive
 *      their OWN lineInterval, inside setObjectFormationPosition:
 *
 *        lineInterval = (container.width - gutters.x * 10) / 5
 *        container.width = w - gx
 *
 * That derived value is the one the routes actually use, so config.js has to
 * invert the formula rather than pass the field length. Getting this wrong
 * does not throw, it just quietly lines the teams up somewhere other than the
 * yard lines they are standing on.
 */

export class TeamFormationsClass {

  // eslint-disable-next-line
  constructor(settings = {}, animations = {}, gameState = {}) {
    this.gameState = gameState;
    this.animations = animations;
    this.defense = ['cover2', 'cover3', 'cover5', 'cover7', 'cover9', 'cover11', 'cover12', 'cover13', 'cover14', 'cover15', 'cover16', 'zone4', 'zone5', 'zone6', 'zone7', 'zone8', 'zone9', 'zone10', 'zone11'];
    // this.defense = ['cover1', 'cover2', 'cover3', 'cover4', 'cover5', 'cover6', 'cover7', 'cover8', 'cover9', 'cover10', 'cover11', 'cover12', 'cover13', 'cover14', 'cover15', 'cover16', 'zone1', 'zone2', 'zone3', 'zone4', 'zone5', 'zone6', 'zone7', 'zone8', 'zone9', 'zone10', 'zone11'];
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
      },
      formation: ''
    };
    this.maxBlizterSpeed = 1.5;
  }

  // eslint-disable-next-line
  coverFormationOverride(objects = [], obj = {}) {
    if ( obj &&
    typeof(obj.settings) !== 'undefined' &&
    obj.settings &&
    typeof(obj.settings.route) !== 'undefined' &&
    obj.settings.route &&
    typeof(obj.settings.route.type) !== 'undefined' &&
    (obj.settings.route.type === 'man' || obj.settings.route.type === 'cover') &&
    typeof(obj.settings.route.cover) !== 'undefined' &&
    obj.settings.route.cover ) {
      const coverObj = this.animations.getObjectByPosition(objects, obj.settings.route.cover);
      if ( coverObj && coverObj.settings.route.type !== 'bench' ) {
        obj.coords.y = coverObj.coords.y;
      }
    }
  }

  // eslint-disable-next-line
  formationRouteDb1(obj = {}, formation = '', lineInterval = 0) {
    const height = this.gameState.state.measurements.height;
    const yInterval = (height / 4);
    const bottom = (height - (this.settings.style.gutters.y * 2));
    const top = 0;
    // const top = (this.settings.style.gutters.y * 2);
    // obj.value = '1';
    switch ( formation ) {
      case 'cover2':
      case 'man2':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 12));
        obj.coords.y = (this.settings.style.gutters.y * 10);
        obj.settings.route = {
          boundaries: {
            bottom,
            left: (lineInterval * 3),
            right: (lineInterval * 5.2),
            top
          },
          cover: 'wr1',
          type: 'cover'
        };
        break;
      case 'cover3':
      case 'man3':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 10));
        obj.coords.y = (this.settings.style.gutters.y * 10);
        obj.settings.route = {
          boundaries: {
            bottom,
            left: (lineInterval * 3),
            right: (lineInterval * 5.2),
            top
          },
          cover: 'wr1',
          type: 'cover'
        };
        break;
      case 'cover4':
      case 'man4':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 10));
        obj.coords.y = (this.settings.style.gutters.y * 10);
        obj.settings.route = {
          boundaries: {
            bottom: (this.state.container.gutters.y * 16),
            left: (lineInterval * 3),
            right: (lineInterval * 4),
            top: (this.state.container.gutters.y * 12)
          },
          cover: null,
          type: 'zone'
        };
        break;
      case 'cover5':
      case 'man5':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 16));
        obj.coords.y = (this.settings.style.gutters.y * 12);
        obj.settings.route = {
          boundaries: {
            bottom: (this.settings.style.gutters.y * 14),
            left: (lineInterval * 3.8),
            right: (lineInterval * 5.2),
            top: (this.settings.style.gutters.y * 12)
          },
          cover: null,
          type: 'zone'
        };
        break;
      case 'cover6':
      case 'man6':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 8));
        obj.coords.y = (this.settings.style.gutters.y * 10);
        obj.settings.route = {
          boundaries: {
            bottom: (this.settings.style.gutters.y * 12),
            left: (lineInterval * 4),
            right: (lineInterval * 5.1),
            top: (this.settings.style.gutters.y * 12)
          },
          cover: null,
          type: 'zone'
        };
        break
      case 'cover7':
      case 'man7':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 14));
        obj.coords.y = (this.settings.style.gutters.y * 10);
        obj.settings.route = {
          boundaries: {
            bottom: (this.settings.style.gutters.y * 16),
            left: (lineInterval * 4.5),
            right: (lineInterval * 5.2),
            top: (this.settings.style.gutters.y * 12)
          },
          cover: null,
          type: 'zone'
        };
        break;
      case 'cover10':
      case 'man10':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 22));
        obj.coords.y = (this.settings.style.gutters.y * 10);
        obj.settings.route = {
          boundaries: {
            bottom: (this.state.container.gutters.y * 18),
            left: (lineInterval * 4.2),
            right: (lineInterval * 5),
            top: (this.state.container.gutters.y * 12)
          },
          cover: null,
          type: 'zone'
        };
        break;
      case 'cover11':
      case 'man11':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 20));
        obj.coords.y = (this.settings.style.gutters.y * 10);
        obj.settings.route = {
          boundaries: {
            bottom,
            left: (lineInterval * 3),
            right: (lineInterval * 5.2),
            top
          },
          cover: 'wr1',
          type: 'cover'
        };
        break;
      case 'cover12':
      case 'man12':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 32));
        obj.coords.y = (this.settings.style.gutters.y * 10);
        obj.physics.maxSpeed = this.maxBlizterSpeed;
        obj.settings.route = {
          boundaries: {
            bottom: height - (this.state.container.gutters.y * 12),
            left: (lineInterval * 2),
            right: (lineInterval * 4),
            top: (this.state.container.gutters.y * 12)
          },
          cover: null,
          type: 'blitz'
        };
        break;
      case 'cover13':
      case 'man13':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 12));
        obj.coords.y = (this.state.container.y - (yInterval * 1.25));
        obj.settings.route = {
          boundaries: {
            bottom: height - (this.state.container.gutters.y * 12),
            left: (lineInterval * 2),
            right: (lineInterval * 4),
            top: (this.state.container.gutters.y * 12)
          },
          cover: 'wr2',
          type: 'cover'
        };
        break;
      case 'cover16':
      case 'man16':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 8));
        obj.coords.y = (this.settings.style.gutters.y * 10);
        obj.physics.maxSpeed = this.maxBlizterSpeed;
        obj.settings.route = {
          boundaries: {
            bottom: height - (this.state.container.gutters.y * 12),
            left: (lineInterval * 2),
            right: (lineInterval * 4),
            top: (this.state.container.gutters.y * 12)
          },
          cover: null,
          type: 'blitz'
        };
        break;
      case 'zone1':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 18));
        obj.coords.y = (this.settings.style.gutters.y * 10);
        obj.settings.route = {
          boundaries: {
            bottom: (this.state.container.gutters.y * 16),
            left: (lineInterval * 3.8),
            right: (lineInterval * 5.1),
            top: (this.state.container.gutters.y * 12)
          },
          cover: null,
          type: 'zone'
        };
        break;
      case 'zone2':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 20));
        obj.coords.y = (this.settings.style.gutters.y * 10);
        obj.settings.route = {
          boundaries: {
            bottom: (obj.coords.y + (this.state.container.gutters.y * 12)),
            left: (lineInterval * 4.2),
            right: (lineInterval * 5),
            top: (obj.coords.y - (this.state.container.gutters.y * 4))
          },
          cover: null,
          type: 'zone'
        };
        break;
      case 'zone3':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 20));
        obj.coords.y = (this.settings.style.gutters.y * 10);
        obj.settings.route = {
          boundaries: {
            bottom: (obj.coords.y + (this.state.container.gutters.y * 12)),
            left: (lineInterval * 4.2),
            right: (lineInterval * 5),
            top: (obj.coords.y + (this.state.container.gutters.y * 4))
          },
          cover: 'wr2',
          type: 'cover'
        };
        break;
      case 'zone4':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 20));
        obj.coords.y = (this.settings.style.gutters.y * 10);
        obj.settings.route = {
          boundaries: {
            bottom: (obj.coords.y + (this.state.container.gutters.y * 12)),
            left: (lineInterval * 4.6),
            right: (lineInterval * 5.2),
            top: (obj.coords.y - (this.state.container.gutters.y * 4))
          },
          cover: null,
          type: 'zone'
        };
        break;
      case 'zone5':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 15));
        obj.coords.y = (this.settings.style.gutters.y * 10);
        obj.settings.route = {
          boundaries: {
            bottom: (obj.coords.y + (this.state.container.gutters.y * 10)),
            left: (lineInterval * 4),
            right: (lineInterval * 5.1),
            top: (obj.coords.y - (this.state.container.gutters.y * 2))
          },
          cover: null,
          type: 'zone'
        };
        break;
      case 'zone6':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 10));
        obj.coords.y = (this.settings.style.gutters.y * 10);
        obj.settings.route = {
          boundaries: {
            bottom: (obj.coords.y + (this.state.container.gutters.y * 12)),
            left: (lineInterval * 4.2),
            right: (lineInterval * 5.2),
            top: (obj.coords.y - (this.state.container.gutters.y * 2))
          },
          cover: null,
          type: 'zone'
        };
        break;
      case 'zone7':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 28));
        obj.coords.y = (this.settings.style.gutters.y * 14);
        obj.physics.maxSpeed = this.maxBlizterSpeed;
        obj.settings.route = {
          boundaries: {
            bottom: height - (this.state.container.gutters.y * 12),
            left: (lineInterval * 2),
            right: (lineInterval * 4),
            top: (this.state.container.gutters.y * 12)
          },
          cover: null,
          type: 'blitz'
        };
        break;
      case 'zone8':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 18));
        obj.coords.y = (yInterval * 0.7);
        obj.physics.maxSpeed = this.maxBlizterSpeed;
        obj.settings.route = {
          boundaries: {
            bottom: height - (this.state.container.gutters.y * 12),
            left: (lineInterval * 2),
            right: (lineInterval * 4),
            top: (this.state.container.gutters.y * 12)
          },
          cover: null,
          type: 'blitz'
        };
        break;
      case 'zone9':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 28));
        obj.coords.y = (yInterval * 1.1);
        obj.physics.maxSpeed = this.maxBlizterSpeed;
        obj.settings.route = {
          boundaries: {
            bottom: height - (this.state.container.gutters.y * 12),
            left: (lineInterval * 2),
            right: (lineInterval * 4),
            top: (this.state.container.gutters.y * 12)
          },
          cover: null,
          type: 'blitz'
        };
        break;
      case 'zone10':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 30));
        obj.coords.y = (yInterval * 1.1);
        obj.settings.route = {
          boundaries: {
            bottom: (yInterval * 2.4),
            left: (lineInterval * 3.8),
            right: (lineInterval * 4.8),
            top: (yInterval * 1.6)
          },
          cover: null,
          type: 'zone'
        };
        break;
      case 'zone11':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 30));
        obj.coords.y = (yInterval * 1.1);
        obj.settings.route = {
          boundaries: {
            bottom: (this.state.container.gutters.y * 18),
            left: (lineInterval * 4),
            right: (lineInterval * 5.2),
            top: (this.state.container.gutters.y * 12)
          },
          cover: null,
          type: 'blitz'
        };
        break;
      default:
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 8));
        obj.coords.y = (this.settings.style.gutters.y * 10);
        obj.settings.route = {
          boundaries: {
            bottom,
            left: (lineInterval * 3),
            right: (lineInterval * 5.2),
            top
          },
          cover: 'wr1',
          type: 'cover'
        };
        break;
    }
  }

  // eslint-disable-next-line
  formationRouteDb2(obj = {}, formation = '', lineInterval = 0) {
    const height = this.gameState.state.measurements.height;
    const yInterval = (height / 4);
    const bottom = (height - (this.settings.style.gutters.y * 2));
    const top = 0;
    // const top = (this.settings.style.gutters.y * 2);
    // obj.value = '2';
    switch ( formation ) {
      case 'cover2':
      case 'man2':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 18));
        obj.coords.y = (this.settings.style.gutters.y * 18);
        obj.settings.route = {
          boundaries: {
            bottom,
            left: (lineInterval * 3),
            right: (lineInterval * 5.2),
            top
          },
          cover: 'wr2',
          type: 'cover'
        };
        break;
      case 'cover5':
      case 'man5':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 12));
        obj.coords.y = (this.settings.style.gutters.y * 18);
        obj.settings.route = {
          boundaries: {
            bottom,
            left: (lineInterval * 3),
            right: (lineInterval * 5.2),
            top
          },
          cover: 'wr2',
          type: 'cover'
        };
        break;
      case 'cover6':
      case 'man6':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 16));
        obj.coords.y = (this.settings.style.gutters.y * 18);
        obj.settings.route = {
          boundaries: {
            bottom: (this.state.container.gutters.y * 14),
            left: (lineInterval * 2.75),
            right: (lineInterval * 3.75),
            top: (this.state.container.gutters.y * 12)
          },
          cover: null,
          type: 'zone'
        };
        break;
      case 'cover7':
      case 'man7':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 26));
        obj.coords.y = (this.settings.style.gutters.y * 10);
        obj.settings.route = {
          boundaries: {
            bottom: (this.state.container.gutters.y * 15),
            left: (lineInterval * 2.75),
            right: (lineInterval * 4),
            top: (this.state.container.gutters.y * 12)
          },
          cover: 'wr3',
          type: 'cover'
        };
        break;
      case 'cover9':
      case 'man9':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 15));
        obj.coords.y = (this.settings.style.gutters.y * 18);
        obj.settings.route = {
          boundaries: {
            bottom: (this.state.container.gutters.y * 14),
            left: (lineInterval * 4.3),
            right: (lineInterval * 4.8),
            top: (this.state.container.gutters.y * 12)
          },
          cover: null,
          type: 'zone'
        };
        break;
      case 'cover12':
      case 'man12':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 13));
        obj.coords.y = (this.settings.style.gutters.y * 18);
        obj.settings.route = {
          boundaries: {
            bottom,
            left: (lineInterval * 3),
            right: (lineInterval * 5.2),
            top
          },
          cover: 'wr1',
          type: 'cover'
        };
        break;
      case 'cover13':
      case 'man13':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 34));
        obj.coords.y = (this.state.container.y - (yInterval * 0.5));
        obj.physics.maxSpeed = this.maxBlizterSpeed;
        obj.settings.route = {
          boundaries: {
            bottom: height - (this.state.container.gutters.y * 12),
            left: (lineInterval * 2),
            right: (lineInterval * 4),
            top: (this.state.container.gutters.y * 12)
          },
          cover: null,
          type: 'blitz'
        };
        break;
      case 'cover15':
      case 'man15':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 18));
        obj.coords.y = (this.settings.style.gutters.y * 18);
        obj.settings.route = {
          boundaries: {
            bottom,
            left: (lineInterval * 3),
            right: (lineInterval * 5.2),
            top
          },
          cover: null,
          type: 'blitz'
        };
        break;
      case 'cover16':
      case 'man16':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 13));
        obj.coords.y = (this.settings.style.gutters.y * 18);
        obj.physics.maxSpeed = this.maxBlizterSpeed;
        obj.settings.route = {
          boundaries: {
            bottom: height - (this.state.container.gutters.y * 12),
            left: (lineInterval * 2),
            right: (lineInterval * 4),
            top: (this.state.container.gutters.y * 12)
          },
          cover: null,
          type: 'blitz'
        };
        break;
      case 'zone1':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 24));
        obj.coords.y = (this.settings.style.gutters.y * 18);
        obj.settings.route = {
          boundaries: {
            bottom: (obj.coords.y + (this.state.container.gutters.y * 4)),
            left: (lineInterval * 4.2),
            right: (lineInterval * 4.9),
            top: (obj.coords.y - (this.state.container.gutters.y * 4))
          },
          cover: null,
          type: 'zone'
        };
        break;
      case 'zone2':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 24));
        obj.coords.y = (this.settings.style.gutters.y * 18);
        obj.settings.route = {
          boundaries: {
            bottom: (obj.coords.y - (this.state.container.gutters.y * 4)),
            left: (lineInterval * 4.2),
            right: (lineInterval * 5.2),
            top: (obj.coords.y - (this.state.container.gutters.y * 12))
          },
          cover: null,
          type: 'zone'
        };
        break;
      case 'zone3':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 24));
        obj.coords.y = (this.settings.style.gutters.y * 18);
        obj.settings.route = {
          boundaries: {
            bottom: (this.state.container.gutters.y * 12),
            left: (lineInterval * 4.2),
            right: (lineInterval * 5.2),
            top: (this.state.container.gutters.y * 12)
          },
          cover: null,
          type: 'zone'
        };
        break;
      case 'zone4':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 24));
        obj.coords.y = (this.settings.style.gutters.y * 18);
        obj.settings.route = {
          boundaries: {
            bottom: (this.state.container.gutters.y * 18),
            left: (lineInterval * 4.1),
            right: (lineInterval * 5.2),
            top: (this.state.container.gutters.y * 10)
          },
          cover: null,
          type: 'zone'
        };
        break;
      case 'zone5':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 19));
        obj.coords.y = (this.settings.style.gutters.y * 18);
        obj.settings.route = {
          boundaries: {
            bottom: (this.state.container.gutters.y * 20),
            left: (lineInterval * 4.2),
            right: (lineInterval * 5.2),
            top: (this.state.container.gutters.y * 12)
          },
          cover: null,
          type: 'zone'
        };
        break;
      case 'zone6':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 18));
        obj.coords.y = (this.settings.style.gutters.y * 18);
        obj.settings.route = {
          boundaries: {
            bottom: (obj.coords.y + (this.state.container.gutters.y * 12)),
            left: (lineInterval * 4),
            right: (lineInterval * 5.2),
            top: (obj.coords.y - (this.state.container.gutters.y * 2))
          },
          cover: null,
          type: 'zone'
        };
        break;
      case 'zone7':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 12));
        obj.coords.y = (this.settings.style.gutters.y * 15);
        obj.settings.route = {
          boundaries: {
            bottom: (obj.coords.y + (this.state.container.gutters.y * 4)),
            left: (lineInterval * 4),
            right: (lineInterval * 5.2),
            top: (obj.coords.y - (this.state.container.gutters.y * 4))
          },
          cover: null,
          type: 'zone'
        };
        break;
      case 'zone8':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 24));
        obj.coords.y = (yInterval * 1.3);
        obj.settings.route = {
          boundaries: {
            bottom: (this.state.container.gutters.y * 14),
            left: (lineInterval * 4),
            right: (lineInterval * 5.2),
            top: (this.state.container.gutters.y * 12)
          },
          cover: null,
          type: 'zone'
        };
        break;
      case 'zone9':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 24));
        obj.coords.y = (yInterval * 0.6);
        obj.settings.route = {
          boundaries: {
            bottom: (this.state.container.gutters.y * 18),
            left: (lineInterval * 4),
            right: (lineInterval * 5.2),
            top: (this.state.container.gutters.y * 12)
          },
          cover: null,
          type: 'zone'
        };
        break;
      case 'zone10':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 22));
        obj.coords.y = (yInterval * 0.7);
        obj.settings.route = {
          boundaries: {
            bottom: (this.state.container.gutters.y * 18),
            left: (lineInterval * 4),
            right: (lineInterval * 5.2),
            top: (this.state.container.gutters.y * 12)
          },
          cover: null,
          type: 'blitz'
        };
        break;
      case 'zone11':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 22));
        obj.coords.y = (yInterval * 0.7);
        obj.settings.route = {
          boundaries: {
            bottom: (yInterval * 1.1),
            left: (lineInterval * 3.8),
            right: (lineInterval * 4.8),
            top: (yInterval * 0.3)
          },
          cover: null,
          type: 'zone'
        };
        break;
      default:
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 13));
        obj.coords.y = (this.settings.style.gutters.y * 18);
        obj.settings.route = {
          boundaries: {
            bottom,
            left: (lineInterval * 3),
            right: (lineInterval * 5.2),
            top
          },
          cover: 'wr2',
          type: 'cover'
        };
        break;
    }
  }

  // eslint-disable-next-line
  formationRouteDb3(obj = {}, formation = '', lineInterval = 0) {
    const height = this.gameState.state.measurements.height;
    const yInterval = (height / 4);
    const bottom = (height - (this.settings.style.gutters.y * 2));
    const top = 0;
    // const top = (this.settings.style.gutters.y * 2);
    // obj.value = '3';
    switch ( formation ) {
      case 'cover2':
      case 'man2':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 16));
        obj.coords.y = (this.state.container.height - (this.settings.style.gutters.y * 21));
        obj.physics.maxSpeed = this.maxBlizterSpeed;
        obj.settings.route = {
          boundaries: {
            bottom: height - (this.state.container.gutters.y * 12),
            left: (lineInterval * 2),
            right: (lineInterval * 4),
            top: (this.state.container.gutters.y * 12)
          },
          cover: null,
          type: 'blitz'
        };
        break;
      case 'cover5':
      case 'man5':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 12));
        obj.coords.y = (this.state.container.height - (this.settings.style.gutters.y * 21));
        obj.settings.route = {
          boundaries: {
            bottom: (this.state.container.height - (this.state.container.gutters.y * 25)),
            left: (lineInterval * 3.5),
            right: (lineInterval * 4),
            top: (this.state.container.height - (this.state.container.gutters.y * 35))
          },
          cover: 'wr3',
          type: 'cover'
        };
        break;
      case 'cover7':
      case 'man7':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 30));
        obj.coords.y = (this.state.container.height - (this.settings.style.gutters.y * 13));
        obj.physics.maxSpeed = this.maxBlizterSpeed;
        obj.settings.route = {
          boundaries: {
            bottom: height - (this.state.container.gutters.y * 12),
            left: (lineInterval * 4.8),
            right: (lineInterval * 5.2),
            top: (this.state.container.gutters.y * 12)
          },
          cover: null,
          type: 'blitz'
        };
        break;
      case 'cover9':
      case 'man9':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 15));
        obj.coords.y = (this.state.container.height - (this.settings.style.gutters.y * 21));
        obj.settings.route = {
          boundaries: {
            bottom,
            left: (lineInterval * 4.3),
            right: (lineInterval * 5),
            top: (this.state.container.y + (this.state.container.gutters.y * 8))
          },
          cover: null,
          type: 'zone'
        };
        break;
      case 'cover13':
      case 'man13':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 22));
        obj.coords.y = (this.state.container.y + (yInterval * 0.5));
        obj.settings.route = {
          boundaries: {
            bottom,
            left: (lineInterval * 3),
            right: (lineInterval * 5.2),
            top
          },
          cover: 'wr4',
          type: 'cover'
        };
        break;
      case 'cover15':
      case 'man15':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 18));
        obj.coords.y = (this.state.container.height - (this.settings.style.gutters.y * 21));
        obj.settings.route = {
          boundaries: {
            bottom: (obj.coords.y + (this.state.container.gutters.y * 1)),
            left: (lineInterval * 4.2),
            right: (lineInterval * 5.1),
            top: (obj.coords.y - (this.state.container.gutters.y * 12)),
          },
          cover: null,
          type: 'zone'
        };
        break;
      case 'cover16':
      case 'man16':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 13));
        obj.coords.y = (this.state.container.height - (this.settings.style.gutters.y * 21));
        obj.settings.route = {
          boundaries: {
            bottom,
            left: (lineInterval * 3),
            right: (lineInterval * 5.2),
            top
          },
          cover: 'wr4',
          type: 'cover'
        };
        break;
      case 'zone1':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 24));
        obj.coords.y = (this.state.container.height - (this.settings.style.gutters.y * 21));
        obj.settings.route = {
          boundaries: {
            bottom: (obj.coords.y + (this.state.container.gutters.y * 4)),
            left: (lineInterval * 4.2),
            right: (lineInterval * 4.9),
            top: (obj.coords.y - (this.state.container.gutters.y * 4))
          },
          cover: null,
          type: 'zone'
        };
        break;
      case 'zone2':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 24));
        obj.coords.y = (this.state.container.height - (this.settings.style.gutters.y * 21));
        obj.settings.route = {
          boundaries: {
            bottom: (obj.coords.y + (this.state.container.gutters.y * 1)),
            left: (lineInterval * 4.2),
            right: (lineInterval * 5.1),
            top: (obj.coords.y - (this.state.container.gutters.y * 12)),
          },
          cover: null,
          type: 'zone'
        };
        break;
      case 'zone3':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 24));
        obj.coords.y = (height - (this.settings.style.gutters.y * 12));
        obj.settings.route = {
          boundaries: {
            bottom: (height - (this.settings.style.gutters.y * 12)),
            left: (lineInterval * 4.2),
            right: (lineInterval * 5),
            top: (height - (this.settings.style.gutters.y * 14))
          },
          cover: null,
          type: 'zone'
        };
        break;
      case 'zone4':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 24));
        obj.coords.y = (this.state.container.height - (this.settings.style.gutters.y * 21));
        obj.settings.route = {
          boundaries: {
            bottom: (obj.coords.y + (this.state.container.gutters.y * 12)),
            left: (lineInterval * 4.2),
            right: (lineInterval * 5.1),
            top: (obj.coords.y + (this.state.container.gutters.y * 12))
          },
          cover: 'wr3',
          type: 'cover'
        };
        break;
      case 'zone5':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 19));
        obj.coords.y = (this.state.container.height - (this.settings.style.gutters.y * 21));
        obj.settings.route = {
          boundaries: {
            bottom: (obj.coords.y + (this.state.container.gutters.y * 12)),
            left: (lineInterval * 4.2),
            right: (lineInterval * 5.1),
            top: (obj.coords.y + (this.state.container.gutters.y * 12))
          },
          cover: 'wr3',
          type: 'cover'
        };
        break;
      case 'zone6':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 24));
        obj.coords.y = (this.state.container.height - (this.settings.style.gutters.y * 21));
        obj.settings.route = {
          boundaries: {
            bottom,
            left: (lineInterval * 3),
            right: (lineInterval * 5.2),
            top
          },
          cover: null,
          type: 'blitz'
        };
        break;
      case 'zone7':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 13));
        obj.coords.y = (this.state.container.height - (this.settings.style.gutters.y * 21));
        obj.settings.route = {
          boundaries: {
            bottom: (obj.coords.y + (this.state.container.gutters.y * 4)),
            left: (lineInterval * 4),
            right: (lineInterval * 5.2),
            top: (obj.coords.y - (this.state.container.gutters.y * 4))
          },
          cover: null,
          type: 'zone'
        };
        break;
      case 'zone8':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 30));
        obj.coords.y = (yInterval * 3);
        obj.physics.maxSpeed = this.maxBlizterSpeed;
        obj.settings.route = {
          boundaries: {
            bottom: height - (this.state.container.gutters.y * 12),
            left: (lineInterval * 2),
            right: (lineInterval * 4),
            top: (this.state.container.gutters.y * 12)
          },
          cover: null,
          type: 'blitz'
        };
        break;
      case 'zone9':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 28));
        obj.coords.y = (yInterval * 3.2);
        obj.settings.route = {
          boundaries: {
            bottom,
            left: (lineInterval * 4),
            right: (lineInterval * 5.2),
            top: (bottom - (this.state.container.gutters.y * 12))
          },
          cover: null,
          type: 'zone'
        };
        break;
      case 'zone10':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 22));
        obj.coords.y = (yInterval * 3.6);
        obj.settings.route = {
          boundaries: {
            bottom: (this.state.container.gutters.y * 18),
            left: (lineInterval * 4),
            right: (lineInterval * 5.2),
            top: (this.state.container.gutters.y * 12)
          },
          cover: null,
          type: 'blitz'
        };
        break;
      case 'zone11':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 22));
        obj.coords.y = (yInterval * 3.6);
        obj.settings.route = {
          boundaries: {
            bottom: (yInterval * 3.9),
            left: (lineInterval * 3.8),
            right: (lineInterval * 4.8),
            top: (yInterval * 3.1)
          },
          cover: null,
          type: 'zone'
        };
        break;
      default:
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 13));
        obj.coords.y = (this.state.container.height - (this.settings.style.gutters.y * 21));
        obj.settings.route = {
          boundaries: {
            bottom,
            left: (lineInterval * 3),
            right: (lineInterval * 5.2),
            top
          },
          cover: 'wr3',
          type: 'cover'
        };
        break;
    }
  }

  // eslint-disable-next-line
  formationRouteDb4(obj = {}, formation = '', lineInterval = 0) {
    const height = this.gameState.state.measurements.height;
    const yInterval = (height / 4);
    const bottom = (height - (this.settings.style.gutters.y * 2));
    const top = 0;
    // const top = (this.settings.style.gutters.y * 2);
    // obj.value = '4';
    switch ( formation ) {
      case 'cover2':
      case 'man2':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 14));
        obj.coords.y = (this.state.container.height - (this.settings.style.gutters.y * 13));
        obj.settings.route = {
          boundaries: {
            bottom,
            left: (lineInterval * 3),
            right: (lineInterval * 5.2),
            top
          },
          cover: 'wr4',
          type: 'cover'
        };
        break;
      case 'cover3':
      case 'man3':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 12));
        obj.coords.y = (this.state.container.height - (this.settings.style.gutters.y * 13));
        obj.settings.route = {
          boundaries: {
            bottom,
            left: (lineInterval * 3),
            right: (lineInterval * 5.2),
            top
          },
          cover: 'wr4',
          type: 'cover'
        };
        break;
      case 'cover4':
      case 'man4':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 12));
        obj.coords.y = (this.state.container.height - (this.settings.style.gutters.y * 13));
        obj.settings.route = {
          boundaries: {
            bottom: (obj.coords.y + (this.state.container.gutters.y * 4)),
            left: (lineInterval * 3),
            right: (lineInterval * 4),
            top: (obj.coords.y - (this.state.container.gutters.y * 10))
          },
          cover: null,
          type: 'zone'
        };
        break;
      case 'cover5':
      case 'man5':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 16));
        obj.coords.y = (this.state.container.height - (this.settings.style.gutters.y * 13));
        obj.settings.route = {
          boundaries: {
            bottom: (this.state.container.height - (this.state.container.gutters.y * 18)),
            left: (lineInterval * 3.5),
            right: (lineInterval * 4.5),
            top: (this.state.container.height - (this.state.container.gutters.y * 28))
          },
          cover: 'wr4',
          type: 'cover'
        };
        break;
      case 'cover7':
      case 'man7':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 14));
        obj.coords.y = (this.state.container.height - (this.settings.style.gutters.y * 13));
        obj.settings.route = {
          boundaries: {
            bottom: (this.state.container.height - (this.state.container.gutters.y * 12)),
            left: (lineInterval * 3.5),
            right: (lineInterval * 4),
            top: (this.state.container.height - (this.state.container.gutters.y * 24))
          },
          cover: 'wr4',
          type: 'cover'
        };
        break;
      case 'cover10':
      case 'man10':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 20));
        obj.coords.y = (this.state.container.height - (this.settings.style.gutters.y * 13));
        obj.settings.route = {
          boundaries: {
            bottom: (this.state.container.height - (this.state.container.gutters.y * 12)),
            left: (lineInterval * 4.3),
            right: (lineInterval * 5),
            top: (this.state.container.height - (this.state.container.gutters.y * 20))
          },
          cover: null,
          type: 'zone'
        };
        break;
      case 'cover11':
      case 'man11':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 24));
        obj.coords.y = (this.state.container.height - (this.settings.style.gutters.y * 20));
        obj.physics.maxSpeed = this.maxBlizterSpeed;
        obj.settings.route = {
          boundaries: {
            bottom: height - (this.state.container.gutters.y * 12),
            left: (lineInterval * 2),
            right: (lineInterval * 4),
            top: (this.state.container.gutters.y * 12)
          },
          cover: null,
          type: 'blitz'
        };
        break;
      case 'cover12':
      case 'man12':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 24));
        obj.coords.y = (this.state.container.height - (this.settings.style.gutters.y * 13));
        obj.settings.route = {
          boundaries: {
            bottom: null,
            left: obj.coords.x,
            right: null,
            top: null
          },
          cover: 'wr4',
          type: 'cover'
        };
        break;
      case 'cover13':
      case 'man13':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 12));
        obj.coords.y = (this.state.container.y + (yInterval * 1.25));
        obj.settings.route = {
          boundaries: {
            bottom,
            left: (lineInterval * 3),
            right: (lineInterval * 5.2),
            top
          },
          cover: 'wr3',
          type: 'cover'
        };
        break;
      case 'cover15':
      case 'man15':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 8));
        obj.coords.y = (this.state.container.height - (this.settings.style.gutters.y * 13));
        obj.physics.maxSpeed = this.maxBlizterSpeed;
        obj.settings.route = {
          boundaries: {
            bottom,
            left: (lineInterval * 3),
            right: (lineInterval * 5.2),
            top
          },
          cover: null,
          type: 'blitz'
        };
        break;
      case 'cover16':
      case 'man16':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 8));
        obj.coords.y = (this.state.container.height - (this.settings.style.gutters.y * 13));
        obj.physics.maxSpeed = this.maxBlizterSpeed;
        obj.settings.route = {
          boundaries: {
            bottom,
            left: (lineInterval * 3),
            right: (lineInterval * 5.2),
            top
          },
          cover: null,
          type: 'blitz'
        };
        break;
      case 'zone1':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 18));
        obj.coords.y = (this.state.container.height - (this.settings.style.gutters.y * 13));
        obj.settings.route = {
          boundaries: {
            bottom: (obj.coords.y + (this.state.container.gutters.y * 4)),
            left: (lineInterval * 4.2),
            right: (lineInterval * 4.9),
            top: (obj.coords.y - (this.state.container.gutters.y * 4))
          },
          cover: null,
          type: 'zone'
        };
        break;
      case 'zone2':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 20));
        obj.coords.y = (this.state.container.height - (this.settings.style.gutters.y * 13));
        obj.settings.route = {
          boundaries: {
            bottom: (obj.coords.y - (this.state.container.gutters.y * 4)),
            left: (lineInterval * 4.2),
            right: (lineInterval * 5.1),
            top: (obj.coords.y - (this.state.container.gutters.y * 12))
          },
          cover: null,
          type: 'zone'
        };
        break;
      case 'zone3':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 20));
        obj.coords.y = (this.state.container.height - (this.settings.style.gutters.y * 13));
        obj.settings.route = {
          boundaries: {
            bottom: (obj.coords.y - (this.state.container.gutters.y * 4)),
            left: (lineInterval * 4.2),
            right: (lineInterval * 5.2),
            top: (obj.coords.y - (this.state.container.gutters.y * 12))
          },
          cover: null,
          type: 'zone'
        };
        break;
      case 'zone4':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 20));
        obj.coords.y = (this.state.container.height - (this.settings.style.gutters.y * 13));
        obj.settings.route = {
          boundaries: {
            bottom: (obj.coords.y - (this.state.container.gutters.y * 4)),
            left: (lineInterval * 4.2),
            right: (lineInterval * 5.2),
            top: (obj.coords.y - (this.state.container.gutters.y * 12))
          },
          cover: null,
          type: 'zone'
        };
        break;
      case 'zone5':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 15));
        obj.coords.y = (this.state.container.height - (this.settings.style.gutters.y * 13));
        obj.settings.route = {
          boundaries: {
            bottom: (obj.coords.y - (this.state.container.gutters.y * 4)),
            left: (lineInterval * 4.2),
            right: (lineInterval * 5.2),
            top: (obj.coords.y - (this.state.container.gutters.y * 12))
          },
          cover: null,
          type: 'zone'
        };
        break;
      case 'zone6':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 12));
        obj.coords.y = (this.state.container.height - (this.settings.style.gutters.y * 13));
        obj.settings.route = {
          boundaries: {
            bottom: obj.coords.y,
            left: (lineInterval * 4.2),
            right: (lineInterval * 5.4),
            top: (obj.coords.y - (this.state.container.gutters.y * 12))
          },
          cover: null,
          type: 'zone'
        };
        break;
      case 'zone7':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 24));
        obj.coords.y = (this.state.container.height - (this.settings.style.gutters.y * 13));
        obj.settings.route = {
          boundaries: {
            bottom: (obj.coords.y + (this.state.container.gutters.y * 4)),
            left: (lineInterval * 4.2),
            right: (lineInterval * 4.9),
            top: (obj.coords.y - (this.state.container.gutters.y * 4))
          },
          cover: null,
          type: 'zone'
        };
        break;
      case 'zone8':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 20));
        obj.coords.y = (yInterval * 3.4);
        obj.settings.route = {
          boundaries: {
            bottom: (obj.coords.y - (this.state.container.gutters.y * 4)),
            left: (lineInterval * 4.2),
            right: (lineInterval * 4.9),
            top: (obj.coords.y - (this.state.container.gutters.y * 12))
          },
          cover: null,
          type: 'zone'
        };
        break;
      case 'zone9':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 24));
        obj.coords.y = (yInterval * 3.7);
        obj.physics.maxSpeed = this.maxBlizterSpeed;
        obj.settings.route = {
          boundaries: {
            bottom,
            left: (lineInterval * 2),
            right: (lineInterval * 4),
            top: (bottom - (this.state.container.gutters.y * 12))
          },
          cover: null,
          type: 'blitz'
        };
        break;
      case 'zone10':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 30));
        obj.coords.y = (yInterval * 3.2);
        obj.settings.route = {
          boundaries: {
            bottom: (yInterval * 3.6),
            left: (lineInterval * 3.8),
            right: (lineInterval * 4.8),
            top: (yInterval * 2.6)
          },
          cover: null,
          type: 'zone'
        };
        break;
      case 'zone11':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 30));
        obj.coords.y = (yInterval * 3.2);
        obj.settings.route = {
          boundaries: {
            bottom: (this.state.container.gutters.y * 18),
            left: (lineInterval * 4),
            right: (lineInterval * 5.2),
            top: (this.state.container.gutters.y * 12)
          },
          cover: null,
          type: 'blitz'
        };
        break;
      default:
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 8));
        obj.coords.y = (this.state.container.height - (this.settings.style.gutters.y * 13));
        obj.settings.route = {
          boundaries: {
            bottom,
            left: (lineInterval * 3),
            right: (lineInterval * 5.2),
            top
          },
          cover: 'wr4',
          type: 'cover'
        };
        break;
    }
  }

  // formationRouteDb5(obj = {}, formation = '', lineInterval = 0) {
  //   const height = this.gameState.state.measurements.height;
  //   const bottom = (height - (this.settings.style.gutters.y * 2));
  //   const top = (this.state.container.y + (this.settings.style.gutters.y * 2));
  //   const yInterval = (height  / 6);
  //   // obj.value = '5';
  //   switch ( formation ) {
  //     case 'cover2':
  //     case 'man2':
  //       obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 22));
  //       obj.coords.y = this.state.container.y;
  //       obj.settings.route = {
  //         boundaries: {
  //           bottom,
  //           left: (lineInterval * 3),
  //           right: (lineInterval * 6),
  //           top
  //         },
  //         cover: 'wr3',
  //         type: 'cover'
  //       };
  //       break;
  //     case 'cover5':
  //     case 'man5':
  //       obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 14));
  //       obj.coords.y = this.state.container.y;
  //       obj.settings.route = {
  //         boundaries: {
  //           bottom,
  //           left: (lineInterval * 3.8),
  //           right: (lineInterval * 6),
  //           top
  //         },
  //         cover: null,
  //         type: 'blitz'
  //       };
  //       break;
  //     case 'cover11':
  //     case 'man11':
  //       obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 16));
  //       obj.coords.y = this.state.container.y;
  //       obj.settings.route = {
  //         boundaries: {
  //           bottom,
  //           left: (lineInterval * 3),
  //           right: (lineInterval * 6),
  //           top
  //         },
  //         cover: 'wr4',
  //         type: 'cover'
  //       };
  //       break;
  //     case 'cover13':
  //     case 'man13':
  //       obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 16));
  //       obj.coords.y = this.state.container.y;
  //       obj.settings.route = {
  //         boundaries: {
  //           bottom,
  //           left: (lineInterval * 3),
  //           right: (lineInterval * 6),
  //           top
  //         },
  //         cover: 'wr1',
  //         type: 'cover'
  //       };
  //       break;
  //     case 'zone2':
  //       obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 28));
  //       obj.coords.y = this.state.container.y;
  //       obj.settings.route = {
  //         boundaries: {
  //           bottom,
  //           left: (lineInterval * 2.5),
  //           right: (lineInterval * 3.5),
  //           top
  //         },
  //         cover: null,
  //         type: 'zone'
  //       };
  //       break;
  //     case 'zone3':
  //       obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 14));
  //       obj.coords.y = this.state.container.y;
  //       obj.settings.route = {
  //         boundaries: {
  //           bottom,
  //           left: (lineInterval * 1.5),
  //           right: (lineInterval * 3),
  //           top
  //         },
  //         cover: null,
  //         type: 'zone'
  //       };
  //       break;
  //     case 'zone5':
  //       obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 16));
  //       obj.coords.y = (yInterval * 2);
  //       obj.settings.route = {
  //         boundaries: {
  //           bottom: (yInterval + (this.state.container.gutters.y * 1)),
  //           left: (lineInterval * 2),
  //           right: (lineInterval * 3),
  //           top: (yInterval - (this.state.container.gutters.y * 1))
  //         },
  //         cover: null,
  //         type: 'zone'
  //       };
  //       break;
  //     default:
  //       obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 14));
  //       obj.coords.y = this.state.container.y;
  //       obj.settings.route = {
  //         boundaries: {
  //           bottom,
  //           left: (lineInterval * 3.8),
  //           right: (lineInterval * 6),
  //           top
  //         },
  //         cover: null,
  //         type: 'zone'
  //       };
  //       break;
  //   }
  // }

  // eslint-disable-next-line
  formationRouteDb6(obj = {}, formation = '', lineInterval = 0) {
    const height = this.gameState.state.measurements.height;
    const bottom = (height - (this.settings.style.gutters.y * 2));
    // obj.value = '6';
    switch ( formation ) {
      default:
        obj.coords.x = -10000;
        obj.coords.y = -10000;
        obj.settings.route = {
          boundaries: {
            bottom,
            left: (lineInterval * 3.8),
            right: (lineInterval * 6),
            top: (this.state.container.y + (this.settings.style.gutters.y * 2))
          },
          cover: null,
          type: 'bench'
        };
        break;
    }
  }

  // eslint-disable-next-line
  formationRouteQb(obj = {}, formation = '', lineInterval = 0) {
    const height = this.gameState.state.measurements.height;
    obj.settings.tackled = 3;
    switch ( formation ) {
      case 'jumbo1':
        // Run low.
        obj.coords.x = (lineInterval - (this.settings.style.gutters.x * 4));
        obj.coords.y = this.state.container.y;
        obj.settings.route = {
          boundaries: {
            bottom: (height - this.state.container.gutters.y),
            left: (lineInterval * 0.6),
            right: (lineInterval * 0.8),
            top: (obj.coords.y + (this.state.container.gutters.y * 12))
          },
          break: 0.2,
          cover: null,
          type: 'qb'
        };
        break;
      case 'jumbo2':
      case 'screen2':
        // Run low.
        obj.coords.x = (lineInterval - (this.settings.style.gutters.x * 4));
        obj.coords.y = this.state.container.y;
        obj.settings.route = {
          boundaries: {
            bottom: (height - this.state.container.gutters.y),
            left: (lineInterval * 0.6),
            right: (lineInterval * 0.8),
            top: (obj.coords.y + (this.state.container.gutters.y * 5))
          },
          break: 0.2,
          cover: null,
          type: 'qb'
        };
        break;
      case 'pass2':
      case 'pass5':
      case 'run1':
      case 'run3':
        // Run low.
        obj.coords.x = (lineInterval - (this.settings.style.gutters.x * 3));
        obj.coords.y = this.state.container.y;
        obj.settings.route = {
          boundaries: {
            bottom: (height - this.state.container.gutters.y),
            left: (lineInterval * 0.6),
            right: (lineInterval * 0.8),
            top: (obj.coords.y + (this.state.container.gutters.y * 3))
          },
          break: 0.2,
          cover: null,
          type: 'qb'
        };
        break;
      case 'pass8':
      case 'run2':
        // Run high.
        obj.coords.x = (lineInterval - (this.settings.style.gutters.x * 3));
        obj.coords.y = this.state.container.y;
        obj.settings.route = {
          boundaries: {
            bottom: (obj.coords.y - (this.state.container.gutters.y * 3)),
            left: (lineInterval * 0.6),
            right: (lineInterval * 0.8),
            top: (obj.coords.y - (this.state.container.gutters.y * 7))
          },
          break: 0.2,
          cover: null,
          type: 'qb'
        };
        break;
      case 'screen1':
        obj.coords.x = (lineInterval - (this.settings.style.gutters.x * 3));
        obj.coords.y = this.state.container.y;
        obj.settings.route = {
          boundaries: {
            bottom: (obj.coords.y),
            left: (lineInterval * 0.6),
            right: (lineInterval * 0.8),
            top: (obj.coords.y - (this.state.container.gutters.y * 4))
          },
          break: 0.2,
          cover: null,
          type: 'qb'
        };
        break;
      default:
        obj.coords.x = (lineInterval - (this.settings.style.gutters.x * 4));
        obj.coords.y = this.state.container.y;
        obj.settings.route = {
          boundaries: {
            bottom: (obj.coords.y + (this.state.container.gutters.y * 12)),
            left: (lineInterval * 0.4),
            right: (lineInterval * 0.9),
            top: (obj.coords.y - (this.state.container.gutters.y * 12))
          },
          break: 0.1,
          cover: null,
          type: 'qb'
        };
        break;
    }
  }

  // eslint-disable-next-line
  formationRouteS1(obj = {}, formation = '', lineInterval = 0) {
    const height = this.gameState.state.measurements.height;
    const yInterval = (height / 4);
    obj.value = 'S';
    switch ( formation ) {
      case 'cover2':
      case 'man2':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 32));
        obj.coords.y = (this.state.container.y - (this.state.container.gutters.y * 4));
        obj.settings.route = {
          boundaries: {
            bottom: (obj.coords.y + (this.state.container.gutters.y * 12)),
            left: (lineInterval * 4),
            right: (lineInterval * 5.2),
            top: (obj.coords.y - (this.state.container.gutters.y * 12))
          },
          cover: null,
          type: 'zone'
        };
        break;
      case 'cover3':
      case 'man3':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 32));
        obj.coords.y = (this.state.container.y - (this.settings.style.gutters.y * 5));
        obj.settings.route = {
          boundaries: {
            bottom: (obj.coords.y + (this.state.container.gutters.y * 12)),
            left: (lineInterval * 4),
            right: (lineInterval * 5.2),
            top: (obj.coords.y - (this.state.container.gutters.y * 12))
          },
          cover: null,
          type: 'zone'
        };
        break;
      case 'cover8':
      case 'man8':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 32));
        obj.coords.y = (this.state.container.y - (this.state.container.gutters.y * 10));
        obj.settings.route = {
          boundaries: {
            bottom: (this.state.container.gutters.y * 14),
            left: (lineInterval * 4.3),
            right: (lineInterval * 5.2),
            top: (this.state.container.gutters.y * 12)
          },
          cover: null,
          type: 'zone'
        };
        break;
      case 'cover9':
      case 'man9':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 32));
        obj.coords.y = (this.state.container.y - (this.state.container.gutters.y * 10));
        obj.settings.route = {
          boundaries: {
            bottom: (this.state.container.y + (this.state.container.gutters.y * 8)),
            left: (lineInterval * 4.3),
            right: (lineInterval * 5.2),
            top: (this.state.container.gutters.y * 18)
          },
          cover: null,
          type: 'zone'
        };
        break;
      case 'cover10':
      case 'man10':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 34));
        obj.coords.y = this.state.container.y;
        obj.settings.route = {
          boundaries: {
            bottom: (obj.coords.y + (this.state.container.gutters.y * 12)),
            left: (lineInterval * 4),
            right: (lineInterval * 5),
            top: (obj.coords.y - (this.state.container.gutters.y * 12))
          },
          cover: null,
          type: 'zone'
        };
        break;
      case 'cover13':
      case 'man13':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 30));
        obj.coords.y = (this.state.container.y + (yInterval * 1.3));
        obj.settings.route = {
          boundaries: {
            bottom: (obj.coords.y + (this.state.container.gutters.y * 10)),
            left: (lineInterval * 4),
            right: (lineInterval * 5.2),
            top: (obj.coords.y - (this.state.container.gutters.y * 2))
          },
          cover: null,
          type: 'zone'
        };
        break;
      case 'cover14':
      case 'man14':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 32));
        obj.coords.y = (this.state.container.y - (this.settings.style.gutters.x * 4));
        obj.settings.route = {
          boundaries: {
            bottom: (obj.coords.y + (this.state.container.gutters.y * 14)),
            left: (lineInterval * 4),
            right: (lineInterval * 5.2),
            top: (obj.coords.y - (this.state.container.gutters.y * 4))
          },
          cover: null,
          type: 'blitz'
        };
        break;
      case 'cover15':
      case 'man15':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 40));
        obj.coords.y = this.state.container.y;
        obj.settings.route = {
          boundaries: {
            bottom: (obj.coords.y + (this.state.container.gutters.y * 14)),
            left: (lineInterval * 4),
            right: (lineInterval * 5.2),
            top: (obj.coords.y - (this.state.container.gutters.y * 4))
          },
          cover: null,
          type: 'zone'
        };
        break;
      case 'zone4':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 32));
        obj.coords.y = this.state.container.y;
        obj.physics.maxSpeed = this.maxBlizterSpeed;
        obj.settings.route = {
          boundaries: {
            bottom: height - (this.state.container.gutters.y * 12),
            left: (lineInterval * 2),
            right: (lineInterval * 4),
            top: (this.state.container.gutters.y * 12)
          },
          cover: null,
          type: 'blitz'
        };
        break;
      case 'zone5':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 32));
        obj.coords.y = this.state.container.y;
        obj.physics.maxSpeed = this.maxBlizterSpeed;
        obj.settings.route = {
          boundaries: {
            bottom: height - (this.state.container.gutters.y * 12),
            left: (lineInterval * 2),
            right: (lineInterval * 4),
            top: (this.state.container.gutters.y * 12)
          },
          cover: null,
          type: 'blitz'
        };
        break;
      case 'zone6':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 32));
        obj.coords.y = (this.state.container.y - (this.state.container.gutters.y * 10));
        obj.physics.maxSpeed = this.maxBlizterSpeed;
        obj.settings.route = {
          boundaries: {
            bottom: height - (this.state.container.gutters.y * 12),
            left: (lineInterval * 2),
            right: (lineInterval * 4),
            top: (this.state.container.gutters.y * 12)
          },
          cover: null,
          type: 'blitz'
        };
        break;
      case 'zone7':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 32));
        obj.coords.y = (this.state.container.y - ((this.state.container.gutters.y * 12)));
        obj.settings.route = {
          boundaries: {
            bottom: (obj.coords.y + (this.state.container.gutters.y * 14)),
            left: (lineInterval * 3),
            right: (lineInterval * 5.2),
            top: (obj.coords.y + (this.state.container.gutters.y * 4))
          },
          cover: null,
          type: 'zone'
        };
        break;
      case 'zone8':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 32));
        obj.coords.y = (yInterval * 2.5);
        obj.settings.route = {
          boundaries: {
            bottom: (obj.coords.y + (this.state.container.gutters.y * 14)),
            left: (lineInterval * 4),
            right: (lineInterval * 5.2),
            top: (obj.coords.y + (this.state.container.gutters.y * 12))
          },
          cover: null,
          type: 'zone'
        };
        break;
      case 'zone10':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 48));
        obj.coords.y = (yInterval * 1.8);
        obj.settings.route = {
          boundaries: {
            bottom: (yInterval * 0.9),
            left: (lineInterval * 4),
            right: (lineInterval * 5.2),
            top: (yInterval * 0.5)
          },
          cover: null,
          type: 'zone'
        };
        break;
      case 'zone11':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 28));
        obj.coords.y = (this.state.container.y- (this.state.container.gutters.y * 4));
        obj.settings.route = {
          boundaries: {
            bottom: (obj.coords.y + (this.state.container.gutters.y * 14)),
            left: (lineInterval * 4),
            right: (lineInterval * 5.2),
            top: (obj.coords.y - (this.state.container.gutters.y * 4))
          },
          cover: null,
          type: 'zone'
        };
        break;
      default:
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 40));
        obj.coords.y = this.state.container.y;
        obj.settings.route = {
          boundaries: {
            bottom: (obj.coords.y + (this.state.container.gutters.y * 14)),
            left: (lineInterval * 4),
            right: (lineInterval * 5.2),
            top: (obj.coords.y - (this.state.container.gutters.y * 4))
          },
          cover: null,
          type: 'zone'
        };
        break;
    }
  }

  // eslint-disable-next-line
  formationRouteS2(obj = {}, formation = '', lineInterval = 0) {
    const height = this.gameState.state.measurements.height;
    const yInterval = (height / 4);
    const bottom = (height - (this.settings.style.gutters.y * 2));
    obj.value = 'L';
    switch ( formation ) {
      case 'cover2':
      case 'man2':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 24));
        obj.coords.y = (this.state.container.y + (this.state.container.gutters.y * 2));
        obj.settings.route = {
          boundaries: {
            bottom: (obj.coords.y + (this.state.container.gutters.y * 12)),
            left: (lineInterval + (lineInterval / 4)),
            right: (lineInterval * 2.5),
            top: (obj.coords.y - (this.state.container.gutters.y * 12))
          },
          cover: null,
          type: 'zone'
        };
        break;
      case 'cover3':
      case 'man3':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 28));
        obj.coords.y = (this.state.container.y + (this.settings.style.gutters.y * 5));
        obj.physics.maxSpeed = this.maxBlizterSpeed;
        obj.settings.route = {
          boundaries: {
            bottom: height - (this.state.container.gutters.y * 12),
            left: (lineInterval * 2),
            right: (lineInterval * 4),
            top: (this.state.container.gutters.y * 12)
          },
          cover: null,
          type: 'blitz'
        };
        break;
      case 'cover5':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 24));
        obj.coords.y = this.state.container.y;
        obj.settings.route = {
          boundaries: {
            bottom: (obj.coords.y + (this.state.container.gutters.y * 4)),
            left: (lineInterval * 2.5),
            right: (lineInterval * 3.5),
            top: (obj.coords.y - (this.state.container.gutters.y * 12))
          },
          cover: null,
          type: 'blitz'
        };
        break;
      case 'cover7':
      case 'man7':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 18));
        obj.coords.y = this.state.container.y;
        obj.settings.route = {
          boundaries: {
            bottom: (obj.coords.y + (this.state.container.gutters.y * 4)),
            left: (lineInterval * 2.5),
            right: (lineInterval * 3.5),
            top: (obj.coords.y - (this.state.container.gutters.y * 12))
          },
          cover: 'wr2',
          type: 'cover'
        };
        break;
      case 'cover8':
      case 'man8':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 32));
        obj.coords.y = (this.state.container.y + (this.state.container.gutters.y * 12));
        obj.settings.route = {
          boundaries: {
            bottom,
            left: (lineInterval * 4.3),
            right: (lineInterval * 5.2),
            top: (this.state.container.y + (this.state.container.gutters.y * 8))
          },
          cover: null,
          type: 'zone'
        };
        break;
      case 'cover9':
      case 'man9':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 32));
        obj.coords.y = (this.state.container.y + (this.state.container.gutters.y * 12));
        obj.physics.maxSpeed = this.maxBlizterSpeed;
        obj.settings.route = {
          boundaries: {
            bottom: height - (this.state.container.gutters.y * 12),
            left: (lineInterval * 2),
            right: (lineInterval * 4),
            top: (this.state.container.gutters.y * 12)
          },
          cover: null,
          type: 'blitz'
        };
        break;
      case 'cover13':
      case 'man13':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 30));
        obj.coords.y = (this.state.container.y - (yInterval * 1.3));
        obj.settings.route = {
          boundaries: {
            bottom: (this.state.container.gutters.y * 18),
            left: (lineInterval * 4),
            right: (lineInterval * 5.2),
            top: (this.state.container.gutters.y * 12)
          },
          cover: null,
          type: 'zone'
        };
        break;
      case 'cover14':
      case 'man14':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 26));
        obj.coords.y = (this.state.container.y + this.settings.style.gutters.y * 12);
        obj.settings.route = {
          boundaries: {
            bottom: (obj.coords.y + (this.state.container.gutters.y * 4)),
            left: (lineInterval * 2.5),
            right: (lineInterval * 3.5),
            top: (obj.coords.y - (this.state.container.gutters.y * 12))
          },
          cover: null,
          type: 'blitz'
        };
        break;
      case 'cover15':
      case 'man15':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 28));
        obj.coords.y = this.state.container.y;
        obj.settings.route = {
          boundaries: {
            bottom: (obj.coords.y + (this.state.container.gutters.y * 4)),
            left: (lineInterval * 2.5),
            right: (lineInterval * 3.5),
            top: (obj.coords.y - (this.state.container.gutters.y * 12))
          },
          cover: null,
          type: 'blitz'
        };
        break;
      case 'cover16':
      case 'man16':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 18));
        obj.coords.y = this.state.container.y;
        obj.settings.route = {
          boundaries: {
            bottom: (this.state.container.y - (yInterval / 2)),
            left: obj.coords.x,
            right: null,
            top: (yInterval / 2)
          },
          cover: 'wr1',
          type: 'cover'
        };
        break;
      case 'zone2':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 18));
        obj.coords.y = this.state.container.y;
        obj.settings.route = {
          boundaries: {
            bottom: obj.coords.y,
            left: (lineInterval * 1.75),
            right: (lineInterval * 3.75),
            top: (obj.coords.y - (this.state.container.gutters.y * 12))
          },
          cover: null,
          type: 'zone'
        };
        break;
      case 'zone4':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 18));
        obj.coords.y = this.state.container.y + (this.state.container.gutters.y * 4);
        obj.settings.route = {
          boundaries: {
            bottom: (obj.coords.y + (this.state.container.gutters.y * 12)),
            left: (lineInterval * 2.5),
            right: (lineInterval * 4),
            top: (obj.coords.y + (this.state.container.gutters.y * 12))
          },
          cover: null,
          type: 'zone'
        };
        break;
      case 'zone5':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 18));
        obj.coords.y = this.state.container.y + (this.state.container.gutters.y * 4);
        obj.settings.route = {
          boundaries: {
            bottom: (obj.coords.y - (this.state.container.gutters.y * 12)),
            left: (lineInterval * 2.5),
            right: (lineInterval * 4),
            top: (obj.coords.y - (this.state.container.gutters.y * 12))
          },
          cover: null,
          type: 'zone'
        };
        break;
      case 'zone6':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 18));
        obj.coords.y = this.state.container.y + (this.state.container.gutters.y * 12);
        obj.settings.route = {
          boundaries: {
            bottom: (obj.coords.y + (this.state.container.gutters.y * 12)),
            left: (lineInterval * 2.7),
            right: (lineInterval * 3.2),
            top: (obj.coords.y - (this.state.container.gutters.y * 12))
          },
          cover: null,
          type: 'zone'
        };
        break;
      case 'zone7':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 18));
        obj.coords.y = (this.state.container.y + (this.state.container.gutters.y * 4));
        obj.settings.route = {
          boundaries: {
            bottom: (obj.coords.y + (this.state.container.gutters.y * 4)),
            left: (lineInterval * 3.5),
            right: (lineInterval * 5.2),
            top: (obj.coords.y - (this.state.container.gutters.y * 12))
          },
          cover: null,
          type: 'zone'
        };
        break;
      case 'zone8':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 20));
        obj.coords.y = (yInterval * 1.7);
        obj.settings.route = {
          boundaries: {
            bottom: (obj.coords.y - (this.state.container.gutters.y * 4)),
            left: (lineInterval * 2.5),
            right: (lineInterval * 4.5),
            top: (obj.coords.y - (this.state.container.gutters.y * 12))
          },
          cover: null,
          type: 'zone'
        };
        break;
      case 'zone10':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 32));
        obj.coords.y = (yInterval * 2.5);
        obj.settings.route = {
          boundaries: {
            bottom: (yInterval * 2),
            left: (lineInterval * 4),
            right: (lineInterval * 5.2),
            top: (yInterval * 1.5)
          },
          cover: null,
          type: 'zone'
        };
        break;
      case 'zone11':
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 28));
        obj.coords.y = (this.state.container.y + this.state.container.gutters.y * 4);
        obj.settings.route = {
          boundaries: {
            bottom: (obj.coords.y + (this.state.container.gutters.y * 4)),
            left: (lineInterval * 2.5),
            right: (lineInterval * 3.5),
            top: (obj.coords.y - (this.state.container.gutters.y * 12))
          },
          cover: null,
          type: 'blitz'
        };
        break;
      default:
        obj.coords.x = (lineInterval + (this.settings.style.gutters.x * 24));
        obj.coords.y = this.state.container.y;
        obj.settings.route = {
          boundaries: {
            bottom: (obj.coords.y + (this.state.container.gutters.y * 4)),
            left: (lineInterval * 2.5),
            right: (lineInterval * 3.5),
            top: (obj.coords.y - (this.state.container.gutters.y * 12))
          },
          cover: null,
          type: 'zone'
        };
        break;
    }
  }

  // eslint-disable-next-line
  formationRouteWr1(obj = {}, formation = '', lineInterval = 0) {
    const height = this.gameState.state.measurements.height;
    const bottom = height;
    const yInterval = (height / 4);
    const top = 0;
    // const top = (this.state.container.gutters.y * 1);
    obj.value = 'A';
    switch ( formation ) {
      case 'pass2':
        obj.coords.x = (lineInterval - this.settings.style.gutters.x);
        obj.coords.y = (this.settings.style.gutters.y * 10);
        obj.settings.route = {
          boundaries: {
            bottom,
            left: (this.state.container.width - ((this.state.container.width / 2))),
            right: (this.state.container.width - (lineInterval / 2)),
            top
          },
          break: 4,
          evade: 'db1',
          type: 'low-deep'
        };
        break;
      case 'pass3':
        obj.coords.x = (lineInterval);
        obj.coords.y = (this.settings.style.gutters.y * 10);
        obj.settings.route = {
          boundaries: {
            bottom,
            left: (this.state.container.width - ((this.state.container.width / 2))),
            right: (this.state.container.width - (lineInterval / 2)),
            top
          },
          break: 2,
          evade: 'db1',
          type: 'low-deep'
        };
        break;
      case 'pass5':
        obj.coords.x = (lineInterval);
        obj.coords.y = (this.settings.style.gutters.y * 10);
        obj.settings.route = {
          boundaries: {
            bottom,
            left: (lineInterval * 1),
            right: (lineInterval * 2),
            top
          },
          evade: 'db1',
          type: 'go'
        };
        break;
      case 'pass6':
        obj.coords.x = (lineInterval - (this.settings.style.gutters.x * 2));
        obj.coords.y = (this.settings.style.gutters.y * 10);
        obj.settings.route = {
          boundaries: {
            bottom,
            left: (lineInterval * 1.2),
            right: (lineInterval * 4.2),
            top
          },
          break: 1.9,
          evade: 'db1',
          type: 'comeback-down'
        };
        break;
      case 'pass7':
        obj.coords.x = (lineInterval);
        obj.coords.y = (this.settings.style.gutters.y * 12);
        obj.settings.route = {
          boundaries: {
            bottom,
            left: lineInterval,
            right: (this.state.container.width - (lineInterval / 2)),
            top
          },
          break: 1.7,
          evade: 'db1',
          type: 'low-deep'
        };
        break;
      case 'pass8':
        obj.coords.x = (lineInterval);
        obj.coords.y = (this.state.container.y - (this.settings.style.gutters.y * 16));
        obj.settings.route = {
          boundaries: {
            bottom,
            left: lineInterval,
            right: (this.state.container.width - (lineInterval / 2)),
            top
          },
          break: 0.5,
          stopX: lineInterval * 2.2,
          stopY: (height / 5),
          type: 'stop'
        };
        break;
      case 'run1':
        obj.coords.x = (lineInterval);
        obj.coords.y = (this.state.container.y - (this.settings.style.gutters.y * 18));
        obj.settings.route = {
          boundaries: {
            bottom,
            left: lineInterval,
            right: (this.state.container.width - (lineInterval / 2)),
            top
          },
          break: 0.5,
          stopX: lineInterval * 1.5,
          stopY: (obj.coords.y + (this.settings.style.gutters.y * 12)),
          type: 'stop'
        };
        break;
      case 'run2':
        obj.coords.x = (lineInterval - (this.settings.style.gutters.x));
        obj.coords.y = (this.state.container.y - (this.settings.style.gutters.y * 16));
        obj.settings.route = {
          boundaries: {
            bottom,
            left: lineInterval,
            right: (this.state.container.width - (lineInterval / 2)),
            top
          },
          break: 0.25,
          stopX: lineInterval * 1.7,
          stopY: (this.settings.style.gutters.y * 12),
          type: 'stop'
        };
        break;
      case 'run3':
        obj.coords.x = (lineInterval - (this.settings.style.gutters.x * 4));
        obj.coords.y = (bottom - (this.settings.style.gutters.y * 8));
        obj.settings.route = {
          boundaries: {
            bottom,
            left: lineInterval,
            right: (this.state.container.width - (lineInterval / 2)),
            top
          },
          break: 0.15,
          stopX: lineInterval * 1.4,
          stopY: obj.coords.y + (yInterval / 2),
          type: 'stop'
        };
        break;
      case 'jumbo1':
        obj.coords.x = (lineInterval);
        obj.coords.y = ( this.state.container.y - (this.settings.style.gutters.y * 14));
        obj.settings.route = {
          boundaries: {
            bottom,
            left: lineInterval,
            right: (this.state.container.width - (lineInterval / 2)),
            top
          },
          break: 0.8,
          evade: 'db1',
          type: 'low-deep'
        };
        break;
      case 'jumbo2':
        obj.coords.x = (lineInterval);
        obj.coords.y = this.state.container.y;
        obj.settings.route = {
          boundaries: {
            bottom,
            left: lineInterval,
            right: (lineInterval * 5),
            top
          },
          break: 0.8,
          evade: 'db1',
          type: 'mid-low-deep'
        };
        break;
      case 'screen1':
        obj.coords.x = (lineInterval - (this.settings.style.gutters.x * 5));
        obj.coords.y = (this.settings.style.gutters.y * 10);
        obj.settings.route = {
          boundaries: {
            bottom,
            left: lineInterval,
            right: (lineInterval * 2),
            top
          },
          break: 0.1,
          stopX: lineInterval * 1.2,
          stopY: (obj.coords.y + (this.state.container.gutters.y * 2)),
          type: 'stop'
        };
        break;
      case 'screen2':
        obj.coords.x = (lineInterval - (this.settings.style.gutters.x * 4));
        obj.coords.y = (bottom - (this.settings.style.gutters.y * 10));
        obj.settings.route = {
          boundaries: {
            bottom,
            left: lineInterval,
            right: (this.state.container.width - (lineInterval / 2)),
            top
          },
          break: 0.1,
          stopX: lineInterval * 1.1,
          stopY: obj.coords.y,
          type: 'stop'
        };
        break;
      case 'slant1':
        obj.coords.x = (lineInterval - this.settings.style.gutters.x * 2);
        obj.coords.y = (this.settings.style.gutters.y * 10);
        obj.settings.route = {
          boundaries: {
            bottom,
            left: (this.state.container.width - ((this.state.container.width / 2))),
            right: (this.state.container.width - (lineInterval / 2)),
            top
          },
          break: 1.65,
          evade: 'db1',
          type: 'mid-low-deep'
        };
        break;
      case 'slant2':
        obj.coords.x = (lineInterval - this.settings.style.gutters.x * 3);
        obj.coords.y = (this.settings.style.gutters.y * 10);
        obj.settings.route = {
          boundaries: {
            bottom,
            left: (this.state.container.width - ((this.state.container.width / 2))),
            right: (this.state.container.width - (lineInterval / 2)),
            top
          },
          break: 1.1,
          evade: 'db1',
          type: 'low-deep'
        };
        break;
      default:
        obj.coords.x = (lineInterval - this.settings.style.gutters.x * 2);
        obj.coords.y = (this.settings.style.gutters.y * 10);
        obj.settings.route = {
          boundaries: {
            bottom,
            left: (lineInterval * 1),
            right: (lineInterval * 2),
            top
          },
          evade: 'db1',
          type: 'go'
        };
        break;
    }
  }

  // eslint-disable-next-line
  formationRouteWr2(obj = {}, formation = '', lineInterval = 0) {
    const height = this.gameState.state.measurements.height;
    const bottom = height;
    const yInterval = (height / 4);
    const top = 0;
    // const top = (this.state.container.gutters.y * 1);
    obj.value = 'B';
    switch ( formation ) {
      case 'pass2':
        obj.coords.x = (lineInterval)
        obj.coords.y = (this.state.container.height - (this.settings.style.gutters.y * 17));
        obj.settings.route = {
          boundaries: {
            bottom,
            left: (this.state.container.width - ((this.state.container.width / 2))),
            right: (this.state.container.width - (lineInterval / 2)),
            top
          },
          break: 2.1,
          evade: 'db2',
          type: 'high-deep'
        };
        break;
      case 'pass3':
        obj.coords.x = (lineInterval - this.settings.style.gutters.x * 2);
        obj.coords.y = (this.state.container.y - (this.settings.style.gutters.y * 12));
        obj.settings.route = {
          boundaries: {
            bottom,
            left: (this.state.container.width - ((this.state.container.width / 2))),
            right: (this.state.container.width - (lineInterval / 2)),
            top
          },
          break: 1.2,
          evade: 'db2',
          type: 'high-deep'
        };
        break;
      case 'pass4':
        obj.coords.x = (lineInterval)
        obj.coords.y = (this.state.container.y - (this.settings.style.gutters.y * 10));
        obj.settings.route = {
          boundaries: {
            bottom,
            left: (this.state.container.width - ((this.state.container.width / 2))),
            right: (this.state.container.width - (lineInterval / 2)),
            top
          },
          evade: 'db2',
          type: 'go'
        };
        break;
      case 'pass5':
        obj.coords.x = (lineInterval - (this.settings.style.gutters.x * 3));
        obj.coords.y = (this.state.container.y + (this.settings.style.gutters.y * 12));
        obj.settings.route = {
          boundaries: {
            bottom,
            left: (this.state.container.width - ((this.state.container.width / 2))),
            right: (this.state.container.width - (lineInterval / 2)),
            top
          },
          break: 1.6,
          evade: 'db2',
          type: 'low-deep'
        };
        break;
      case 'pass6':
        obj.coords.x = (lineInterval)
        obj.coords.y = (this.state.container.y - (this.settings.style.gutters.y * 10));
        obj.settings.route = {
          boundaries: {
            bottom,
            left: lineInterval,
            right: (this.state.container.width - (lineInterval / 2)),
            top
          },
          break: 2.4,
          evade: 'db2',
          type: 'comeback-up'
        };
        break;
      case 'pass7':
        obj.coords.x = (lineInterval - (this.settings.style.gutters.x * 2));
        obj.coords.y = (this.state.container.y - (this.settings.style.gutters.y * 13));
        obj.settings.route = {
          boundaries: {
            bottom,
            left: lineInterval,
            right: (this.state.container.width - (lineInterval / 2)),
            top
          },
          break: 2.1,
          evade: 'db2',
          type: 'comeback-down'
        };
        break;
      case 'pass8':
        obj.coords.x = (lineInterval)
        obj.coords.y = (this.state.container.y - (this.settings.style.gutters.y * 10));
        obj.settings.route = {
          boundaries: {
            bottom,
            left: lineInterval,
            right: (this.state.container.width - (lineInterval / 2)),
            top
          },
          break: 0.5,
          stopX: lineInterval * 2,
          stopY: (obj.coords.y - (this.settings.style.gutters.y * 4)),
          type: 'stop'
        };
        break;
      case 'run1':
        obj.coords.x = (lineInterval)
        obj.coords.y = (this.state.container.y - (this.settings.style.gutters.y * 12));
        obj.settings.route = {
          boundaries: {
            bottom,
            left: lineInterval,
            right: (this.state.container.width - (lineInterval / 2)),
            top
          },
          break: 0.5,
          stopX: lineInterval * 1.55,
          stopY: (obj.coords.y + (this.settings.style.gutters.y * 12)),
          type: 'stop'
        };
        break;
      case 'run2':
        obj.coords.x = (lineInterval)
        obj.coords.y = (this.state.container.y - (this.settings.style.gutters.y * 12));
        obj.settings.route = {
          boundaries: {
            bottom,
            left: lineInterval,
            right: (this.state.container.width - (lineInterval / 2)),
            top
          },
          break: 0.25,
          stopX: lineInterval * 1.5,
          stopY: (this.settings.style.gutters.y * 16),
          type: 'stop'
        };
        break;
      case 'run3':
        obj.coords.x = (lineInterval)
        obj.coords.y = (bottom - (this.settings.style.gutters.y * 12));
        obj.settings.route = {
          boundaries: {
            bottom,
            left: lineInterval,
            right: (this.state.container.width - (lineInterval / 2)),
            top
          },
          break: 0.15,
          stopX: lineInterval * 2.2,
          stopY: obj.coords.y + (yInterval / 2),
          type: 'stop'
        };
        break;
      case 'jumbo1':
        obj.coords.x = (lineInterval);
        obj.coords.y = ( this.state.container.y + (this.settings.style.gutters.y * 18));
        obj.settings.route = {
          boundaries: {
            bottom,
            left: lineInterval,
            right: (this.state.container.width - (lineInterval / 2)),
            top
          },
          break: 2.4,
          evade: 'db2',
          type: 'high-deep'
        };
        break;
      case 'jumbo2':
        obj.coords.x = (lineInterval - this.settings.style.gutters.x * 6);
        obj.coords.y = ( this.state.container.y + (this.settings.style.gutters.y * 10));
        obj.settings.route = {
          boundaries: {
            bottom,
            left: lineInterval,
            right: (lineInterval * 5),
            top
          },
          break: 1,
          evade: 'db2',
          type: 'low-deep'
        };
        break;
      case 'screen1':
        obj.coords.x = (lineInterval)
        obj.coords.y = (this.state.container.y + (this.state.container.gutters.y * 10));
        obj.settings.route = {
          boundaries: {
            bottom,
            left: lineInterval,
            right: (lineInterval * 5),
            top
          },
          break: 1.3,
          evade: 'db2',
          type: 'high-deep'
        };
        break;
      case 'screen2':
        // obj.coords.x = lineInterval;
        // obj.coords.y = (bottom - (this.settings.style.gutters.y * 10));
        obj.coords.x = (lineInterval)
        obj.coords.y = (bottom - (this.settings.style.gutters.y * 14));
        obj.settings.route = {
          boundaries: {
            bottom,
            left: lineInterval,
            right: (this.state.container.width - (lineInterval / 2)),
            top
          },
          break: 0.1,
          stopX: lineInterval * 1.5,
          stopY: obj.coords.y,
          type: 'stop'
        };
        break;
      case 'slant1':
        obj.coords.x = (lineInterval)
        obj.coords.y = (this.state.container.y - (this.settings.style.gutters.y * 10));
        obj.settings.route = {
          boundaries: {
            bottom,
            left: (this.state.container.width - ((this.state.container.width / 2))),
            right: (this.state.container.width - (lineInterval / 2)),
            top
          },
          break: 1.45,
          evade: 'db2',
          type: 'low-deep'
        };
        break;
      case 'slant2':
        obj.coords.x = (lineInterval)
        obj.coords.y = (this.state.container.height - (this.settings.style.gutters.y * 18));
        obj.settings.route = {
          boundaries: {
            bottom,
            left: (this.state.container.width - ((this.state.container.width / 2))),
            right: (this.state.container.width - (lineInterval / 2)),
            top
          },
          break: 1.7,
          evade: 'db2',
          type: 'mid-high-deep'
        };
        break;
      default:
        obj.coords.x = (lineInterval)
        obj.coords.y = (this.state.container.y - (this.settings.style.gutters.y * 10));
        obj.settings.route = {
          boundaries: {
            bottom,
            left: (this.state.container.width - ((this.state.container.width / 2))),
            right: (this.state.container.width - (lineInterval / 2)),
            top
          },
          break: 2,
          evade: 'db2',
          type: 'low-deep'
        };
        break;
    }
  }

  // eslint-disable-next-line
  formationRouteWr3(obj = {}, formation = '', lineInterval = 0) {
    const height = this.gameState.state.measurements.height;
    const bottom = height;
    const yInterval = (height / 4);
    const top = 0;
    // const top = (this.state.container.gutters.y * 1);
    obj.value = 'C';
    switch ( formation ) {
      case 'pass2':
        obj.coords.x = (lineInterval - this.settings.style.gutters.x * 3);
        obj.coords.y = (this.state.container.height - (this.settings.style.gutters.y * 21));
        obj.settings.route = {
          boundaries: {
            bottom,
            left: (this.state.container.width - ((this.state.container.width / 2))),
            right: (this.state.container.width - (lineInterval / 2)),
            top
          },
          break: 1.1,
          evade: 'db3',
          type: 'deep'
        };
        break;
      case 'pass3':
        obj.coords.x = (lineInterval - this.settings.style.gutters.x * 2);
        obj.coords.y = (this.state.container.y + (this.settings.style.gutters.y * 11));
        obj.settings.route = {
          boundaries: {
            bottom,
            left: (this.state.container.width - ((this.state.container.width / 2))),
            right: (this.state.container.width - (lineInterval / 2)),
            top
          },
          break: 2.8,
          evade: 'db3',
          type: 'mid-high-deep'
        };
        break;
      case 'pass5':
        obj.coords.x = (lineInterval)
        obj.coords.y = (this.state.container.height - (this.settings.style.gutters.y * 18));
        obj.settings.route = {
          boundaries: {
            bottom,
            left: (this.state.container.width - ((this.state.container.width / 2))),
            right: (this.state.container.width - (lineInterval / 2)),
            top
          },
          break: 1.1,
          evade: 'db3',
          type: 'mid-high-deep'
        };
        break;
      case 'pass6':
        obj.coords.x = (lineInterval)
        obj.coords.y = (this.state.container.y + (this.settings.style.gutters.y * 10));
        obj.settings.route = {
          boundaries: {
            bottom,
            left: lineInterval,
            right: (this.state.container.width - (lineInterval / 2)),
            top
          },
          break: 2.5,
          evade: 'db3',
          type: 'comeback-down'
        };
        break;
      case 'pass7':
        obj.coords.x = (lineInterval - (this.settings.style.gutters.x * 2));
        obj.coords.y = (this.state.container.y + (this.settings.style.gutters.y * 13));
        obj.settings.route = {
          boundaries: {
            bottom,
            left: lineInterval,
            right: (this.state.container.width - (lineInterval / 2)),
            top
          },
          break: 1.7,
          evade: 'db3',
          type: 'comeback-down'
        };
        break;
      case 'pass8':
        obj.coords.x = (lineInterval)
        obj.coords.y = (this.state.container.y + (this.settings.style.gutters.y * 12));
        obj.settings.route = {
          boundaries: {
            bottom,
            left: lineInterval,
            right: (this.state.container.width - (lineInterval / 2)),
            top
          },
          break: 0.5,
          stopX: lineInterval * 1.8,
          stopY: (obj.coords.y - (this.settings.style.gutters.y * 4)),
          type: 'stop'
        };
        break;
      case 'run1':
        obj.coords.x = (lineInterval)
        obj.coords.y = (this.state.container.y + (this.settings.style.gutters.y * 12));
        obj.settings.route = {
          boundaries: {
            bottom,
            left: lineInterval,
            right: (this.state.container.width - (lineInterval / 2)),
            top
          },
          break: 0.5,
          stopX: lineInterval * 1.6,
          stopY: (obj.coords.y + (this.settings.style.gutters.y * 12)),
          type: 'stop'
        };
        break;
      case 'run2':
        obj.coords.x = (lineInterval)
        obj.coords.y = (this.state.container.y + (this.settings.style.gutters.y * 12));
        obj.settings.route = {
          boundaries: {
            bottom,
            left: lineInterval,
            right: (this.state.container.width - (lineInterval / 2)),
            top
          },
          break: 0.25,
          stopX: lineInterval * 1.2,
          stopY: (this.settings.style.gutters.y * 26),
          type: 'stop'
        };
        break;
      case 'run3':
        obj.coords.x = (lineInterval);
        obj.coords.y = (bottom - (this.settings.style.gutters.y * 8));
        obj.settings.route = {
          boundaries: {
            bottom,
            left: lineInterval,
            right: (this.state.container.width - (lineInterval / 2)),
            top
          },
          break: 0.15,
          stopX: lineInterval * 2.4,
          stopY: obj.coords.y + (yInterval / 3),
          type: 'stop'
        };
        break;
      case 'jumbo1':
      case 'jumbo2':
      case 'screen1':
        obj.coords.x = -10000;
        obj.coords.y = -10000;
        obj.settings.route = {
          boundaries: {
            bottom,
            left: lineInterval,
            right: (this.state.container.width - (lineInterval / 2)),
            top
          },
          break: 0.2,
          stopX: lineInterval * 2.5,
          stopY: obj.coords.y + (lineInterval / 5),
          type: 'bench'
        };
        break;
      case 'screen2':
        obj.coords.x = (lineInterval)
        obj.coords.y = (this.state.container.y - (this.settings.style.gutters.y * 12));
        obj.settings.route = {
          boundaries: {
            bottom,
            left: lineInterval,
            right: (lineInterval * 3),
            top
          },
          break: 0.9,
          stopX: (lineInterval * 2.5),
          stopY: (obj.coords.y + (yInterval * 1.5)),
          type: 'stop'
        };
        break;
      case 'slant1':
        obj.coords.x = (lineInterval)
        obj.coords.y = (this.state.container.y + (this.settings.style.gutters.y * 10));
        obj.settings.route = {
          boundaries: {
            bottom,
            left: (this.state.container.width - ((this.state.container.width / 2))),
            right: (this.state.container.width - (lineInterval / 2)),
            top
          },
          break: 1.1,
          evade: 'db3',
          type: 'high-deep'
        };
        break;
      case 'slant2':
        obj.coords.x = (lineInterval - this.settings.style.gutters.x * 3);
        obj.coords.y = (this.state.container.height - (this.settings.style.gutters.y * 24));
        obj.settings.route = {
          boundaries: {
            bottom,
            left: (this.state.container.width - ((this.state.container.width / 2))),
            right: (this.state.container.width - (lineInterval / 2)),
            top
          },
          break: 1.25,
          evade: 'db3',
          type: 'high-deep'
        };
        break;
      default:
        obj.coords.x = (lineInterval)
        obj.coords.y = (this.state.container.y + (this.settings.style.gutters.y * 10));
        obj.settings.route = {
          boundaries: {
            bottom,
            left: (this.state.container.width - ((this.state.container.width / 2))),
            right: (this.state.container.width - (lineInterval / 2)),
            top
          },
          evade: 'db3',
          type: 'go'
        };
        break;
    }
  }

  // eslint-disable-next-line
  formationRouteWr4(obj = {}, formation = '', lineInterval = 0) {
    const height = this.gameState.state.measurements.height;
    const bottom = height;
    const top = 0;
    // const top = (this.state.container.gutters.y * 1);
    obj.value = 'D';
    switch ( formation ) {
      case 'pass2':
        obj.coords.x = (lineInterval - this.settings.style.gutters.x * 3);
        obj.coords.y = (this.state.container.height - (this.settings.style.gutters.y * 13));
        obj.settings.route = {
          boundaries: {
            bottom,
            left: (this.state.container.width - ((this.state.container.width / 2))),
            right: (this.state.container.width - (lineInterval / 2)),
            top
          },
          break: 2.8,
          evade: 'db4',
          type: 'mid-high-deep'
        };
        break;
      case 'pass3':
        obj.coords.x = (lineInterval)
        obj.coords.y = (this.state.container.height - (this.settings.style.gutters.y * 13));
        obj.settings.route = {
          boundaries: {
            bottom,
            left: (this.state.container.width - ((this.state.container.width / 2))),
            right: (this.state.container.width - (lineInterval / 2)),
            top
          },
          break: 3.2,
          evade: 'db4',
          type: 'deep'
        };
        break;
      case 'pass4':
        obj.coords.x = (lineInterval - this.settings.style.gutters.x);
        obj.coords.y = (this.state.container.height - (this.settings.style.gutters.y * 13));
        obj.settings.route = {
          boundaries: {
            bottom,
            left: (this.state.container.width - ((this.state.container.width / 2))),
            right: (this.state.container.width - (lineInterval / 2)),
            top
          },
          evade: 'db4',
          type: 'go'
        };
        break;
      case 'pass5':
        obj.coords.x = (lineInterval)
        obj.coords.y = (this.state.container.height - (this.settings.style.gutters.y * 13));
        obj.settings.route = {
          boundaries: {
            bottom,
            left: (this.state.container.width - ((this.state.container.width / 2))),
            right: (this.state.container.width - (lineInterval / 2)),
            top
          },
          break: 1.4,
          evade: 'db4',
          type: 'deep'
        };
        break;
      case 'pass6':
        obj.coords.x = (lineInterval - (this.settings.style.gutters.x * 2));
        obj.coords.y = (this.state.container.height - (this.settings.style.gutters.y * 16));
        obj.settings.route = {
          boundaries: {
            bottom,
            left: (this.state.container.width - ((this.state.container.width / 2))),
            right: (this.state.container.width - (lineInterval / 2)),
            top
          },
          break: 3.6,
          evade: 'db4',
          type: 'deep'
        };
        break;
      case 'pass7':
        obj.coords.x = (lineInterval)
        obj.coords.y = (this.state.container.height - (this.settings.style.gutters.y * 17));
        obj.settings.route = {
          boundaries: {
            bottom,
            left: lineInterval,
            right: (this.state.container.width - (lineInterval / 2)),
            top
          },
          break: 2.9,
          evade: 'db4',
          type: 'high-deep'
        };
        break;
      case 'pass8':
        // stop 1.
        obj.coords.x = (lineInterval - this.settings.style.gutters.x * 2);
        obj.coords.y = (this.state.container.y + (this.settings.style.gutters.y * 16));
        obj.settings.route = {
          boundaries: {
            bottom,
            left: lineInterval,
            right: (this.state.container.width - (lineInterval / 2)),
            top
          },
          break: 1,
          evade: 'db4',
          type: 'mid-high-deep'
        };
        break;
      case 'run1':
        obj.coords.x = (lineInterval - this.settings.style.gutters.x * 2);
        obj.coords.y = (this.state.container.y + (this.settings.style.gutters.y * 18));
        obj.settings.route = {
          boundaries: {
            bottom,
            left: (this.state.container.width - ((this.state.container.width / 2))),
            right: (this.state.container.width - (lineInterval / 2)),
            top
          },
          evade: 'db4',
          type: 'go'
        };
        break;
      case 'run2':
        obj.coords.x = (lineInterval - this.settings.style.gutters.x * 2);
        obj.coords.y = (this.state.container.y + (this.settings.style.gutters.y * 14));
        obj.settings.route = {
          boundaries: {
            bottom,
            left: lineInterval,
            right: (this.state.container.width - (lineInterval / 2)),
            top
          },
          break: 0.25,
          stopX: lineInterval * 1.6,
          stopY: (this.settings.style.gutters.y * 24),
          type: 'stop'
        };
        break;
      case 'run3':
        obj.coords.x = (lineInterval);
        obj.coords.y = (bottom - (this.settings.style.gutters.y * 4));
        obj.settings.route = {
          boundaries: {
            bottom,
            left: lineInterval,
            right: (this.state.container.width - (lineInterval / 2)),
            top
          },
          break: 0.2,
          stopX: lineInterval * 2.9,
          stopY: obj.coords.y + (lineInterval / 5),
          type: 'stop'
        };
        break;
      case 'jumbo1':
      case 'jumbo2':
      case 'screen1':
      case 'screen2':
        obj.coords.x = -10000;
        obj.coords.y = -10000;
        obj.settings.route = {
          boundaries: {
            bottom,
            left: lineInterval,
            right: (this.state.container.width - (lineInterval / 2)),
            top
          },
          break: 0.2,
          stopX: lineInterval * 2.5,
          stopY: obj.coords.y + (lineInterval / 5),
          type: 'bench'
        };
        break;
      case 'slant1':
        obj.coords.x = (lineInterval - this.settings.style.gutters.x * 2);
        obj.coords.y = (this.state.container.height - (this.settings.style.gutters.y * 13));
        obj.settings.route = {
          boundaries: {
            bottom,
            left: (this.state.container.width - ((this.state.container.width / 2))),
            right: (this.state.container.width - (lineInterval / 2)),
            top
          },
          break: 1.6,
          evade: 'db4',
          type: 'mid-high-deep'
        };
        break;
      case 'slant2':
        obj.coords.x = (lineInterval - this.settings.style.gutters.x * 3);
        obj.coords.y = (this.state.container.height - (this.settings.style.gutters.y * 13));
        obj.settings.route = {
          boundaries: {
            bottom,
            left: (this.state.container.width - ((this.state.container.width / 2))),
            right: (this.state.container.width - (lineInterval / 2)),
            top
          },
          break: 2.2,
          evade: 'db4',
          type: 'deep'
        };
        break;
      default:
        obj.coords.x = (lineInterval - this.settings.style.gutters.x * 2);
        obj.coords.y = (this.state.container.height - (this.settings.style.gutters.y * 13));
        obj.settings.route = {
          boundaries: {
            bottom,
            left: (this.state.container.width - ((this.state.container.width / 2))),
            right: (this.state.container.width - (lineInterval / 2)),
            top
          },
          break: 1.2,
          evade: 'db4',
          type: 'deep'
        };
        break;
    }
  }

  // eslint-disable-next-line
  formationRouteX1(obj = {}, formation = '', lineInterval = 0) {
    const height = this.gameState.state.measurements.height;
    const bottom = (height - (this.settings.style.gutters.y * 2));
    const yInterval = (height / 4);
    obj.value = 'X';
    obj.physics.xMulti = 15;
    obj.physics.yMulti = 10;
    // obj.style.text.font = 'bold 30px Tahoma, Geneva, sans-serif';
    switch ( formation ) {
      case 'pass1':
      case 'pass2':
      case 'pass3':
      case 'pass4':
      case 'pass5':
      case 'pass6':
      case 'pass7':
      case 'pass8':
      case 'run1':
      case 'run2':
      case 'slant1':
      case 'slant2':
      case 'screen2':
        obj.coords.x = (lineInterval - (this.settings.style.gutters.x));
        obj.coords.y = (this.state.container.y - (this.settings.style.gutters.y * 4));
        obj.settings.route = {
          boundaries: {
            bottom: (obj.coords.y + this.settings.style.gutters.y * 10),
            left: (lineInterval * 0.2),
            right: (lineInterval * 1.5),
            top: (obj.coords.y - this.settings.style.gutters.y * 10)
          },
          break: 0.1,
          stopX: (lineInterval * 1.1),
          stopY: (obj.coords.y - this.settings.style.gutters.y * 4),
          type: 'stop'
        };
        break;
      case 'run3':
        obj.coords.x = (lineInterval - (this.settings.style.gutters.x));
        obj.coords.y = (this.state.container.y - (this.settings.style.gutters.y * 4));
        obj.settings.route = {
          boundaries: {
            bottom: (obj.coords.y + this.settings.style.gutters.y * 10),
            left: (lineInterval * 0.2),
            right: (lineInterval * 1.5),
            top: (obj.coords.y - this.settings.style.gutters.y * 10)
          },
          break: 0.1,
          stopX: (lineInterval * 2),
          stopY: (bottom - (this.settings.style.gutters.y * 12)),
          type: 'stop'
        };
        break;
      case 'jumbo1':
        obj.coords.x = (lineInterval - (this.settings.style.gutters.x));
        obj.coords.y = (this.state.container.y - (this.settings.style.gutters.y * 4));
        obj.settings.route = {
          boundaries: {
            bottom,
            left: lineInterval,
            right: (lineInterval * 5),
            top: obj.coords.y
          },
          break: 0.2,
          stopX: (lineInterval * 1.25),
          stopY: (obj.coords.y + (this.settings.style.gutters.y * 2)),
          type: 'stop'
        };
        break;
      case 'jumbo2':
        obj.coords.x = (lineInterval);
        obj.coords.y = (this.state.container.y - (this.settings.style.gutters.y * 14));
        obj.settings.route = {
          boundaries: {
            bottom,
            left: lineInterval,
            right: (lineInterval * 5),
            top: obj.coords.y
          },
          break: 0.2,
          stopX: (lineInterval * 1.25),
          stopY: (obj.coords.y + (yInterval * 1.5)),
          type: 'stop'
        };
        break;
      case 'screen1':
        obj.coords.x = (lineInterval);
        obj.coords.y = (this.settings.style.gutters.y * 10);
        obj.settings.route = {
          boundaries: {
            bottom,
            left: lineInterval,
            right: (this.state.container.width - (lineInterval / 2)),
            top: obj.coords.y
          },
          break: 1.1,
          stopX: (lineInterval * 1.7),
          stopY: (obj.coords.y - (this.settings.style.gutters.y * 1)),
          type: 'stop'
        };
        break;
      default:
        obj.coords.x = -10000;
        obj.coords.y = -10000;
        obj.settings.route = {
          boundaries: {
            bottom,
            left: lineInterval,
            right: (this.state.container.width - (lineInterval / 2)),
            top: (this.state.container.gutters.y * 12)
          },
          break: 0.2,
          stopX: (lineInterval * 1.25),
          stopY: (obj.coords.y + (yInterval * 1)),
          type: 'bench'
        };
        break;
    }
  }

  // eslint-disable-next-line
  formationRouteX2(obj = {}, formation = '', lineInterval = 0) {
    const height = this.gameState.state.measurements.height;
    const bottom = (height - (this.settings.style.gutters.y * 2));
    const yInterval = (height / 4);
    obj.value = 'X';
    obj.physics.xMulti = 12;
    obj.physics.yMulti = 8;
    switch ( formation ) {
      case 'pass1':
      case 'pass2':
      case 'pass3':
      case 'pass4':
      case 'pass5':
      case 'slant1':
      case 'slant2':
        obj.coords.x = (lineInterval)
        obj.coords.y = this.state.container.y;
        obj.settings.route = {
          boundaries: {
            bottom: (obj.coords.y + this.settings.style.gutters.y * 10),
            left: (lineInterval * 0.2),
            right: (lineInterval * 1.5),
            top: (obj.coords.y - this.settings.style.gutters.y * 10)
          },
          break: 0.5,
          stopX: (lineInterval * 1),
          stopY: this.state.container.y,
          type: 'stop'
        };
        break;
      case 'pass8':
      case 'run1':
      case 'run2':
      case 'run3':
      case 'screen2':
        obj.coords.x = (lineInterval)
        obj.coords.y = this.state.container.y;
        obj.settings.route = {
          boundaries: {
            bottom: (obj.coords.y + this.settings.style.gutters.y * 10),
            left: (lineInterval * 0.2),
            right: (lineInterval * 1.5),
            top: (obj.coords.y - this.settings.style.gutters.y * 10)
          },
          break: 0.1,
          stopX: (lineInterval * 1.2),
          stopY: (obj.coords.y - (this.settings.style.gutters.y)),
          type: 'stop'
        };
        break;
      case 'pass6':
        obj.coords.x = (lineInterval)
        obj.coords.y = this.state.container.y;
        obj.settings.route = {
          boundaries: {
            bottom: (obj.coords.y + this.settings.style.gutters.y * 10),
            left: (lineInterval * 0.2),
            right: (lineInterval * 1.5),
            top: (obj.coords.y - this.settings.style.gutters.y * 10)
          },
          break: 0.5,
          stopX: (lineInterval * 3),
          stopY: (obj.coords.y + (this.settings.style.gutters.y)),
          type: 'stop'
        };
        break;
      case 'pass7':
        obj.coords.x = (lineInterval)
        obj.coords.y = this.state.container.y;
        obj.settings.route = {
          boundaries: {
            bottom: (obj.coords.y + this.settings.style.gutters.y * 10),
            left: (lineInterval * 0.2),
            right: (lineInterval * 1.5),
            top: (obj.coords.y - this.settings.style.gutters.y * 10)
          },
          break: 0.5,
          stopX: (lineInterval * 2.8),
          stopY: (obj.coords.y + (this.settings.style.gutters.y * 2)),
          type: 'stop'
        };
        break;
      case 'jumbo1':
        obj.coords.x = (lineInterval);
        obj.coords.y = (this.state.container.y);
        obj.settings.route = {
          boundaries: {
            bottom,
            left: lineInterval,
            right: (lineInterval * 5),
            top: obj.coords.y
          },
          break: 0.2,
          stopX: (lineInterval * 1.9),
          stopY: (obj.coords.y + (this.settings.style.gutters.y * 12)),
          type: 'stop'
        };
        break;
      case 'jumbo2':
        obj.coords.x = (lineInterval - (this.settings.style.gutters.x * 2));
        obj.coords.y = (this.state.container.y - (this.settings.style.gutters.y * 9));
        obj.settings.route = {
          boundaries: {
            bottom,
            left: lineInterval,
            right: (lineInterval * 5),
            top: obj.coords.y
          },
          break: 0.2,
          stopX: (lineInterval * 1.5),
          stopY: (obj.coords.y + (yInterval * 1)),
          type: 'stop'
        };
        break;
      case 'screen1':
        obj.coords.x = (lineInterval);
        obj.coords.y = (this.settings.style.gutters.y * 14);
        obj.settings.route = {
          boundaries: {
            bottom,
            left: lineInterval,
            right: (lineInterval * 5),
            top: (this.state.container.gutters.y * 10)
          },
          break: 1.5,
          stopX: (lineInterval * 1.75),
          stopY: (obj.coords.y - (this.settings.style.gutters.y * 2)),
          type: 'stop'
        };
        break;
      default:
        obj.coords.x = -10000;
        obj.coords.y = -10000;
        obj.settings.route = {
          boundaries: {
            bottom,
            left: lineInterval,
            right: (this.state.container.width - (lineInterval / 2)),
            top: (this.state.container.gutters.y * 12)
          },
          break: 0.2,
          stopX: (lineInterval * 1.25),
          stopY: (obj.coords.y + (yInterval * 1)),
          type: 'bench'
        };
        break;
    }
  }

  // eslint-disable-next-line
  formationRouteX3(obj = {}, formation = '', lineInterval = 0) {
    const height = this.gameState.state.measurements.height;
    const bottom = (height - (this.settings.style.gutters.y * 2));
    const yInterval = (height / 4);
    obj.value = 'X';
    obj.physics.xMulti = 18;
    obj.physics.yMulti = 8;
    switch ( formation ) {
      case 'pass1':
      case 'pass2':
      case 'pass3':
      case 'pass4':
      case 'pass5':
      case 'pass6':
      case 'pass7':
      case 'slant1':
      case 'slant2':
      case 'run1':
      case 'run2':
        obj.coords.x = (lineInterval - (this.settings.style.gutters.x));
        obj.coords.y = (this.state.container.y + (this.settings.style.gutters.y * 4));
        obj.settings.route = {
          boundaries: {
            bottom: (obj.coords.y + this.settings.style.gutters.y * 10),
            left: (lineInterval * 0.2),
            right: (lineInterval * 1.5),
            top: (obj.coords.y - this.settings.style.gutters.y * 10)
          },
          break: 0.1,
          stopX: (lineInterval * 1.1),
          stopY: obj.coords.y,
          type: 'stop'
        };
        break;
      case 'screen2':
        obj.coords.x = (lineInterval - (this.settings.style.gutters.x));
        obj.coords.y = (this.state.container.y + (this.settings.style.gutters.y * 4));
        obj.settings.route = {
          boundaries: {
            bottom: (obj.coords.y + this.settings.style.gutters.y * 10),
            left: (lineInterval * 0.2),
            right: (lineInterval * 1.5),
            top: (obj.coords.y - this.settings.style.gutters.y * 10)
          },
          break: 1.1,
          stopX: (lineInterval * 1.5),
          stopY: (obj.coords.y + (this.settings.style.gutters.y * 12)),
          type: 'stop'
        };
        break;
      case 'run3':
        obj.coords.x = (lineInterval - (this.settings.style.gutters.x));
        obj.coords.y = (this.state.container.y + (this.settings.style.gutters.y * 4));
        obj.settings.route = {
          boundaries: {
            bottom: (obj.coords.y + this.settings.style.gutters.y * 10),
            left: (lineInterval * 0.2),
            right: (lineInterval * 1.5),
            top: (obj.coords.y - this.settings.style.gutters.y * 10)
          },
          break: 1.1,
          stopX: (lineInterval * 1.6),
          stopY: (obj.coords.y + (this.settings.style.gutters.y * 4)),
          type: 'stop'
        };
        break;
      case 'pass8':
        obj.coords.x = (lineInterval - (this.settings.style.gutters.x))
        obj.coords.y = this.state.container.y + (this.settings.style.gutters.y * 4);
        obj.settings.route = {
          boundaries: {
            bottom: obj.coords.y,
            left: (lineInterval * 2),
            right: (lineInterval * 5),
            top: (this.settings.style.gutters.y * 4)
          },
          break: 0.1,
          stopX: (lineInterval * 3),
          stopY: (obj.coords.y - yInterval),
          type: 'stop'
        };
        break;
      case 'jumbo1':
        obj.coords.x = (lineInterval - (this.settings.style.gutters.x));
        obj.coords.y = (this.state.container.y + (this.settings.style.gutters.y * 4));
        obj.settings.route = {
          boundaries: {
            bottom,
            left: lineInterval,
            right: (this.state.container.width - (lineInterval / 2)),
            top: (this.state.container.gutters.y * 12)
          },
          break: 0.1,
          stopX: (lineInterval * 1.5),
          stopY: (obj.coords.y + (yInterval * 1)),
          type: 'stop'
        };
        break;
      case 'jumbo2':
        obj.coords.x = (lineInterval - (this.settings.style.gutters.x));
        obj.coords.y = (this.state.container.y + (this.settings.style.gutters.y * 12));
        obj.settings.route = {
          boundaries: {
            bottom,
            left: lineInterval,
            right: (lineInterval * 5),
            top: obj.coords.y
          },
          break: 0.4,
          stopX: (lineInterval * 2.5),
          stopY: (obj.coords.y + (yInterval * 1.3)),
          type: 'stop'
        };
        break;
      case 'screen1':
        obj.coords.x = (lineInterval - (this.settings.style.gutters.x));
        obj.coords.y = (this.settings.style.gutters.y * 18);
        obj.settings.route = {
          boundaries: {
            bottom,
            left: lineInterval,
            right: (this.state.container.width - (lineInterval / 2)),
            top: (this.state.container.gutters.y * 12)
          },
          break: 1.5,
          stopX: (lineInterval * 1.75),
          stopY: obj.coords.y,
          type: 'stop'
        };
        break;
      default:
        obj.coords.x = -10000;
        obj.coords.y = -10000;
        obj.settings.route = {
          boundaries: {
            bottom,
            left: lineInterval,
            right: (this.state.container.width - (lineInterval / 2)),
            top: (this.state.container.gutters.y * 12)
          },
          break: 0.2,
          stopX: (lineInterval * 1.25),
          stopY: (obj.coords.y + (yInterval * 1)),
          type: 'bench'
        };
        break;
    }
  }

  // eslint-disable-next-line
  formationRouteX4(obj = {}, formation = '', lineInterval = 0) {
    const height = this.gameState.state.measurements.height;
    const bottom = (height - (this.settings.style.gutters.y * 2));
    const yInterval = (height / 4);
    obj.value = 'X';
    obj.physics.xMulti = 20;
    obj.physics.yMulti = 10;
    switch ( formation ) {
      // case 'pass1':
      // case 'pass2':
      // case 'pass3':
      // case 'pass4':
      // case 'pass5':
      //   obj.coords.x = (lineInterval - (this.settings.style.gutters.x * 2));
      //   obj.coords.y = (this.state.container.y - (this.settings.style.gutters.y * 12));
      //   obj.settings.route = {
      //     boundaries: {
      //       bottom: (obj.coords.y + this.settings.style.gutters.y * 10),
      //       left: (lineInterval * 0.2),
      //       right: (lineInterval * 1.5),
      //       top: (obj.coords.y - this.settings.style.gutters.y * 10)
      //     },
      //     break: 0.1,
      //     stopX: (lineInterval * 1.1),
      //     stopY: (obj.coords.y - this.settings.style.gutters.y * 4),
      //     type: 'stop'
      //   };
      //   break;
      // case 'pass6':
      // case 'pass7':
      //   obj.coords.x = (lineInterval - (this.settings.style.gutters.x * 4));
      //   obj.coords.y = (this.state.container.y - (this.settings.style.gutters.y * 6));
      //   obj.settings.route = {
      //     boundaries: {
      //       bottom: (obj.coords.y + this.settings.style.gutters.y * 10),
      //       left: (lineInterval * 3),
      //       right: (lineInterval * 5),
      //       top: (obj.coords.y - this.settings.style.gutters.y * 10)
      //     },
      //     break: 1.5,
      //     stopX: (lineInterval * 3.5),
      //     stopY: (obj.coords.y - (this.settings.style.gutters.y)),
      //     type: 'stop'
      //   };
      //   break;
      case 'pass8':
        obj.coords.x = (lineInterval - (this.settings.style.gutters.x * 4));
        obj.coords.y = (this.state.container.y - (this.settings.style.gutters.y * 6));
        obj.settings.route = {
          boundaries: {
            bottom,
            left: lineInterval,
            right: (this.state.container.width - (lineInterval / 2)),
            top: (this.state.container.gutters.y * 12)
          },
          break: 0.1,
          stopX: (lineInterval * 2),
          stopY: (obj.coords.y - (this.state.container.gutters.y * 2)),
          type: 'stop'
        };
        break;
      case 'run1':
        obj.coords.x = (lineInterval - (this.settings.style.gutters.x * 3));
        obj.coords.y = (this.state.container.y + (this.settings.style.gutters.y * 8));
        obj.settings.route = {
          boundaries: {
            bottom,
            left: lineInterval,
            right: (lineInterval * 5),
            top: (this.state.container.gutters.y * 12)
          },
          break: 1.6,
          stopX: (lineInterval * 2),
          stopY: (obj.coords.y + (this.state.container.gutters.y * 12)),
          type: 'stop'
        };
        break;
      case 'run2':
        obj.coords.x = (lineInterval - (this.settings.style.gutters.x * 4));
        obj.coords.y = (this.state.container.y - (this.settings.style.gutters.y * 8));
        obj.settings.route = {
          boundaries: {
            bottom,
            left: lineInterval,
            right: (lineInterval * 5),
            top: (this.state.container.gutters.y * 12)
          },
          break: 1.8,
          stopX: (lineInterval * 2.2),
          stopY: (obj.coords.y - (this.state.container.gutters.y * 12)),
          type: 'stop'
        };
        break;
      case 'run3':
        obj.coords.x = (lineInterval - (this.settings.style.gutters.x * 2.5));
        obj.coords.y = (this.state.container.y + (this.settings.style.gutters.y * 8));
        obj.settings.route = {
          boundaries: {
            bottom,
            left: lineInterval,
            right: (lineInterval * 5),
            top: (this.state.container.gutters.y * 12)
          },
          break: 0.1,
          stopX: (lineInterval * 1.75),
          stopY: (bottom - (this.state.container.gutters.y * 4)),
          type: 'stop'
        };
        break;
      case 'jumbo1':
        obj.coords.x = (lineInterval - (this.settings.style.gutters.x * 3));
        obj.coords.y = (this.state.container.y + (this.settings.style.gutters.y * 8));
        obj.settings.route = {
          boundaries: {
            bottom,
            left: lineInterval,
            right: (this.state.container.width - (lineInterval / 2)),
            top: (this.state.container.gutters.y * 12)
          },
          break: 1.1,
          stopX: (lineInterval * 1.25),
          stopY: (obj.coords.y + (yInterval * 1.5)),
          type: 'stop'
        };
        break;
      case 'jumbo2':
        obj.coords.x = (lineInterval - (this.settings.style.gutters.x * 2));
        obj.coords.y = (this.state.container.y + (this.settings.style.gutters.y * 16));
        obj.settings.route = {
          boundaries: {
            bottom,
            left: lineInterval,
            right: (lineInterval * 5),
            top: obj.coords.y
          },
          break: 1.1,
          stopX: (lineInterval * 1.95),
          stopY: (obj.coords.y + (yInterval)),
          type: 'stop'
        };
        break;
      case 'screen1':
        obj.coords.x = (lineInterval);
        obj.coords.y = this.state.container.y;
        obj.settings.route = {
          boundaries: {
            bottom,
            left: lineInterval,
            right: (lineInterval * 5),
            top: (this.state.container.gutters.y * 4)
          },
          break: 0.1,
          stopX: (lineInterval * 1.75),
          stopY: (obj.coords.y - (yInterval)),
          type: 'stop'
        };
        break;
      case 'screen2':
        obj.coords.x = (lineInterval - (this.settings.style.gutters.x * 3))
        obj.coords.y = (bottom - (this.settings.style.gutters.y * 17));
        obj.settings.route = {
          boundaries: {
            bottom,
            left: (lineInterval * 0.2),
            right: (lineInterval * 1.5),
            top: (obj.coords.y - this.settings.style.gutters.y * 10)
          },
          break: 1.1,
          stopX: (lineInterval * 1.2),
          stopY: (obj.coords.y - (this.settings.style.gutters.y * 2)),
          type: 'stop'
        };
        break;
      default:
        obj.coords.x = -10000;
        obj.coords.y = -10000;
        obj.settings.route = {
          boundaries: {
            bottom,
            left: lineInterval,
            right: (this.state.container.width - (lineInterval / 2)),
            top: (this.state.container.gutters.y * 12)
          },
          break: 0.2,
          stopX: (lineInterval * 1.25),
          stopY: (obj.coords.y + (yInterval * 1)),
          type: 'bench'
        };
        break;
    }
  }

  // eslint-disable-next-line
  formationRouteX5(obj = {}, formation = '', lineInterval = 0) {
    const height = this.gameState.state.measurements.height;
    const bottom = (height - (this.settings.style.gutters.y * 2));
    const yInterval = (height / 4);
    obj.value = 'X';
    obj.physics.xMulti = 17;
    obj.physics.yMulti = 7;
    switch ( formation ) {
      // case 'pass6':
      // case 'pass7':
      //   obj.coords.x = (lineInterval - (this.settings.style.gutters.x * 4));
      //   obj.coords.y = (this.state.container.y + (this.settings.style.gutters.y * 8));
      //   obj.settings.route = {
      //     boundaries: {
      //       bottom: (obj.coords.y + this.settings.style.gutters.y * 10),
      //       left: (lineInterval * 3),
      //       right: (lineInterval * 5),
      //       top: (obj.coords.y - this.settings.style.gutters.y * 10)
      //     },
      //     break: 1.1,
      //     stopX: (lineInterval * 3.5),
      //     stopY: (obj.coords.y + (this.settings.style.gutters.y)),
      //     type: 'stop'
      //   };
      //   break;
      case 'run3':
        obj.coords.x = (lineInterval - (this.settings.style.gutters.x * 2.5));
        obj.coords.y = (this.state.container.y - (this.settings.style.gutters.y * 8));
        obj.settings.route = {
          boundaries: {
            bottom,
            left: lineInterval,
            right: (lineInterval * 5),
            top: (this.state.container.gutters.y * 12)
          },
          break: 0.2,
          stopX: (lineInterval * 1.1),
          stopY: (obj.coords.y - (this.state.container.gutters.y * 2)),
          type: 'stop'
        };
        break;
      case 'jumbo1':
        obj.coords.x = (lineInterval - (this.settings.style.gutters.x * 2.5));
        obj.coords.y = (this.state.container.y - (this.settings.style.gutters.y * 8));
        obj.settings.route = {
          boundaries: {
            bottom: (obj.coords.y + this.settings.style.gutters.y * 10),
            left: (lineInterval * 0.2),
            right: (lineInterval * 1.5),
            top: (obj.coords.y - this.settings.style.gutters.y * 10)
          },
          break: 1.1,
          stopX: (lineInterval * 1.1),
          stopY: (obj.coords.y - this.settings.style.gutters.y * 2),
          type: 'stop'
        };
        break;
      case 'jumbo2':
        obj.coords.x = (lineInterval - (this.settings.style.gutters.x));
        obj.coords.y = (this.state.container.y - (this.settings.style.gutters.y * 4));
        obj.settings.route = {
          boundaries: {
            bottom: (obj.coords.y + this.settings.style.gutters.y * 10),
            left: (lineInterval * 0.2),
            right: (lineInterval * 1.5),
            top: (obj.coords.y - this.settings.style.gutters.y * 10)
          },
          break: 1.1,
          stopX: (lineInterval * 1.9),
          stopY: (obj.coords.y + this.settings.style.gutters.y * 2),
          type: 'stop'
        };
        break;
      case 'screen1':
        obj.coords.x = (lineInterval - (this.settings.style.gutters.x));
        obj.coords.y = (this.state.container.y - (this.settings.style.gutters.y * 4));
        obj.settings.route = {
          boundaries: {
            bottom: (obj.coords.y + this.settings.style.gutters.y * 10),
            left: (lineInterval * 0.2),
            right: (lineInterval * 1.5),
            top: (obj.coords.y - this.settings.style.gutters.y * 10)
          },
          break: 0.1,
          stopX: (lineInterval * 1.5),
          stopY: (obj.coords.y - this.settings.style.gutters.y * 12),
          type: 'stop'
        };
        break;
      case 'screen2':
        obj.coords.x = (lineInterval)
        obj.coords.y = (bottom - (this.settings.style.gutters.y * 4));
        obj.settings.route = {
          boundaries: {
            bottom,
            left: (lineInterval * 0.2),
            right: (lineInterval * 1.5),
            top: (obj.coords.y - this.settings.style.gutters.y * 10)
          },
          break: 1.2,
          stopX: (lineInterval * 1.8),
          stopY: (obj.coords.y - (this.settings.style.gutters.y * 1)),
          type: 'stop'
        };
        break;
      default:
        obj.coords.x = -10000;
        obj.coords.y = -10000;
        obj.settings.route = {
          boundaries: {
            bottom,
            left: lineInterval,
            right: (this.state.container.width - (lineInterval / 2)),
            top: (this.state.container.gutters.y * 12)
          },
          break: 0.2,
          stopX: (lineInterval * 1.25),
          stopY: (obj.coords.y + (yInterval * 1)),
          type: 'bench'
        };
        break;
    }
  }

  // eslint-disable-next-line
  formationRouteX6(obj = {}, formation = '', lineInterval = 0) {
    const height = this.gameState.state.measurements.height;
    const bottom = (height - (this.settings.style.gutters.y * 2));
    const yInterval = (height / 4);
    obj.value = 'X';
    obj.physics.xMulti = 20;
    obj.physics.yMulti = 5;
    switch ( formation ) {
      case 'jumbo1':
        obj.coords.x = (lineInterval - (this.settings.style.gutters.x * 2.5));
        obj.coords.y = (this.state.container.y + (this.settings.style.gutters.y * 8));
        obj.settings.route = {
          boundaries: {
            bottom: (obj.coords.y + this.settings.style.gutters.y * 10),
            left: (lineInterval * 0.2),
            right: (lineInterval * 1.5),
            top: (obj.coords.y - this.settings.style.gutters.y * 10)
          },
          break: 1.1,
          stopX: (lineInterval * 1),
          stopY: (bottom - (this.settings.style.gutters.y * 12)),
          type: 'stop'
        };
        break;
      case 'jumbo2':
        obj.coords.x = (lineInterval - (this.settings.style.gutters.x));
        obj.coords.y = (this.state.container.y + (this.settings.style.gutters.y * 5));
        obj.settings.route = {
          boundaries: {
            bottom: (obj.coords.y + this.settings.style.gutters.y * 10),
            left: (lineInterval * 0.2),
            right: (lineInterval * 1.5),
            top: (obj.coords.y - this.settings.style.gutters.y * 10)
          },
          break: 1.1,
          stopX: (lineInterval * 1.8),
          stopY: (bottom - (this.settings.style.gutters.y * 12)),
          type: 'stop'
        };
        break;
      case 'screen1':
        obj.coords.x = (lineInterval - (this.settings.style.gutters.x));
        obj.coords.y = (this.state.container.y + (this.settings.style.gutters.y * 4));
        obj.settings.route = {
          boundaries: {
            bottom: (obj.coords.y + this.settings.style.gutters.y * 10),
            left: (lineInterval * 0.2),
            right: (lineInterval * 1.5),
            top: (obj.coords.y - this.settings.style.gutters.y * 10)
          },
          break: 0.1,
          stopX: (lineInterval * 1.1),
          stopY: obj.coords.y,
          type: 'stop'
        };
        break;
      // case 'screen2':
      //   obj.coords.x = (lineInterval)
      //   obj.coords.y = bottom;
      //   obj.settings.route = {
      //     boundaries: {
      //       bottom,
      //       left: (lineInterval * 0.2),
      //       right: (lineInterval * 1.5),
      //       top: (obj.coords.y - this.settings.style.gutters.y * 10)
      //     },
      //     break: 1.2,
      //     stopX: (lineInterval * 2),
      //     stopY: obj.coords.y,
      //     type: 'stop'
      //   };
      //   break;
      default:
        obj.coords.x = -10000;
        obj.coords.y = -10000;
        obj.settings.route = {
          boundaries: {
            bottom,
            left: lineInterval,
            right: (this.state.container.width - (lineInterval / 2)),
            top: (this.state.container.gutters.y * 12)
          },
          break: 0.2,
          stopX: (lineInterval * 1.25),
          stopY: (obj.coords.y + (yInterval * 1)),
          type: 'bench'
        };
        break;
    }
  }

  // eslint-disable-next-line
  generateBallObject(state = {}, animations = {}) {
    const {
      game,
    } = state;
    const lineInterval = this.gameState.state.measurements.lineInterval;
    const width = this.gameState.state.measurements.width;
    const xMin = (this.state.container.gutters.x * 2);
    const xMax = width;
    const yMin = (this.state.container.gutters.y * 12);
    const yMax = (this.state.container.height - (this.state.container.gutters.y * 10));
    const qbObj = animations.getObjectByPosition(game.objects, 'qb');
    const receiverObj = animations.getObjectByPosition(game.objects, game.throwTo);
    if ( qbObj && receiverObj ) {
      const startX = (qbObj.coords.x - 4);
      const startY = (qbObj.coords.y - 14);
      const recX = receiverObj.coords.x;
      const recY = receiverObj.coords.y;
      let targetX = receiverObj.coords.x;
      let targetY = receiverObj.coords.y;
      const xDist = (targetX - startX);
      const yDist = (targetY - startY);
      const xIntervals = Math.ceil(xDist / lineInterval);
      let xLead = 0;
      let xDistDiv = 3.4;
      switch ( xIntervals ) {
        case 3:
          if ( (xDist / lineInterval) < 3 ) {
            xDistDiv = 4.1;
          } else {
            xDistDiv = 3.4;
          }
          break;
        case 2:
          if ( (xDist / lineInterval) < 1.5 ) {
            xDistDiv = 3.2;
          } else {
            xDistDiv = 3.4;
          }
          break;
        default:
          break;
      }
      // Find closest defender.
      const defenderObj = this.gameState.getClosestTeamObjectToPosition(game.objects, 1, (recX - 20), recY, 30, ['db1', 'db2', 'db3', 'db4', 'db6', 's1', 's2']);
      if ( defenderObj ) {
        const defX = defenderObj.coords.x;
        if ( defX < recX ) {
          xLead = (receiverObj.state.xSpeed * 10);
        }
      }
      if ( receiverObj.state.xSpeed !== 0 ) {
        let xSpeed = receiverObj.state.xSpeed;
        if ( xSpeed < 0 ) {
          xSpeed = 0.1;
        }
        targetX += (xSpeed * (xDist / xDistDiv)) + xLead;
      }
      if ( receiverObj.state.ySpeed !== 0 ) {
        if ( targetY < qbObj.coords.y && receiverObj.state.ySpeed < 0 ) {
          targetY += (receiverObj.state.ySpeed * (yDist / 4)) + (receiverObj.state.ySpeed * 45);
        } else if ( targetY >= qbObj.coords.y && receiverObj.state.ySpeed < 0 ) {
          targetY += (receiverObj.state.ySpeed * (yDist / 4)) + (receiverObj.state.ySpeed * 10);
        } else if ( targetY >= qbObj.coords.y && receiverObj.state.ySpeed > 0 ) {
          targetY += (receiverObj.state.ySpeed * (yDist / 4)) + (receiverObj.state.ySpeed * 12);
        } else {
          targetY += (receiverObj.state.ySpeed * (yDist / 4)) + (receiverObj.state.ySpeed * 25);
        }
      }
      if ( targetX > xMax ) {
        targetX = xMax;
      } else if ( targetX < xMin ) {
        targetX = xMin;
      }
      if ( targetY > yMax ) {
        targetY = yMax;
      } else if ( targetY < yMin ) {
        targetY = yMin;
      }
      let throttle = (state.window.width < 700) ? 4 : 5;
      if ( xDist < 50 ) {
        throttle = (state.window.width < 700) ? 2 : 3;
      } else if ( xDist < 65 ) {
        throttle = 3;
      } else if ( xDist < 80 ) {
        throttle = 4;
      } else if ( xDist > lineInterval * 2.75 && state.window.width > 700 ) {
        throttle = 7;
      } else if ( xDist > lineInterval * 2.25 ) {
        throttle = (state.window.width < 700) ? 5 : 6;
      } else if ( xDist > lineInterval ) {
        throttle = 5;
      }
      let slope = ((targetY - startY) / (targetX - startX));
      if ( slope > 1 ) {
        slope = 0.99;
      }
      const ballObject = {
        anim: 'formation',
        coords: {
          list: [],
          slope,
          startX,
          startY,
          targetX,
          targetY,
          x: startX,
          y: startY,
          z: 1
        },
        physics: {
          decel: 0.1,
          maxSpeed: 7
        },
        settings: {
          player: 0,
          position: 'ball',
          positionGroup: 'ball',
          team: 0,
          type: 'ball'
        },
        state: {
          stripePosition: 0,
          xSpeed: 0,
          ySpeed: 0
        },
        style: {
          height: 3,
          width: 5
        }
      };
      if (this.state.container.width >= 900 && xDist > 500 && throttle < 8) {
        throttle += 1;
        // ballObject.style.height = 4;
        // ballObject.style.width = 6;
      } else if (this.state.container.width >= 900 && xDist > 400 && throttle < 7) {
        throttle += 1;
      }
      ballObject.coords.list = this.gameState.getLineCoords([ballObject.coords.startX, ballObject.coords.startY], [ballObject.coords.targetX, ballObject.coords.targetY], throttle);
      return ballObject;
    } else {
      // TODO.
      // Handle this weird condition if it ever occurs.
      return null;
    }
  }

  // eslint-disable-next-line
  generateTeamFormationObject(state, team, player, positionGroup, position) {
    const {
      teams,
    } = state.game;
    const toggle1 = Math.round(Math.random());
    const toggle2 = Math.round(Math.random());
    const toggle3 = Math.round(Math.random());
    const minSpeed = (state.window.width >= 700) ? 1.75 : 1.5;
    const speedLimit = (state.window.width >= 700) ? 2.2 : 1.9;
    const inc = (state.window.width >= 700) ? 0.2 : 0.1;
    let accel = (state.window.width >= 700) ? 0.2 : 0.1;
    const decel = (state.window.width >= 700) ? 1.5 : 1.35;
    let maxSpeed = minSpeed;
    if ( toggle1 ) {
      maxSpeed += inc;
      if ( toggle2 ) {
        maxSpeed += inc;
        if ( toggle3 ) {
          accel += 0.075;
          maxSpeed += inc;
        }
      } else if ( toggle3 ) {
        maxSpeed += inc;
      }
    } else if ( toggle2 ) {
      maxSpeed += inc;
      if ( toggle3 ) {
        accel += 0.075;
        maxSpeed += inc;
      }
    } else if ( toggle3 ) {
      maxSpeed += inc;
    } else {
      accel -= 0.075;
      maxSpeed -= (inc / 2);
    }
    if ( maxSpeed > speedLimit ) {
      maxSpeed = speedLimit;
    }

    if ( maxSpeed < minSpeed ) {
      maxSpeed = minSpeed;
    }

    if ( this.state.container.width >= 700 ) {
      accel += 0.2;
      // decel += 0.1;
      maxSpeed += 0.2;
    }

    let font = '';
    if ( team === 0 ) {
      font = teams[team].style.text.font;
      if ( positionGroup === 'x' ) {
        font = teams[team].style.text.fontX;
      }
    } else {
      font = teams[team].style.text.font;
    }

    const toggle4 = Math.round(Math.random());
    const toggle5 = Math.round(Math.random());
    const toggle6 = Math.round(Math.random());
    let tackled = 2;
    if ( toggle4 ) {
      tackled += 3;
      if ( toggle5 ) {
        tackled += 3;
        if ( toggle6 ) {
          tackled += 3;
        }
      }
    } else if ( toggle5 ) {
      tackled += 3;
      if ( toggle6 ) {
        tackled += 3;
      }
    } else if ( toggle6 ) {
      tackled += 3;
    } else {
      tackled = 1;
    }

    if ( tackled > 10 ) {
      tackled = 10;
    }

    if (accel < 0.35 && state.window.width >= 900) {
      accel = 0.35;
    } else if (accel < 0.25 && state.window.width >= 700) {
      accel = 0.25;
    } else if (accel < 0.15) {
      accel = (state.window.width < 700) ? 0.15 : 0.25;
    }

    if (maxSpeed < 2 && state.window.width >= 700) {
      maxSpeed = 2;
    }

    /**
     * AND THEN THE GAME LEANS ON IT, WHICH IS THE ADAPTIVE DIFFICULTY.
     *
     * APPLIED HERE, AFTER THE FLOORS, and that is not a detail: the two clamps
     * above raise a slow player back up, so a bias applied before them would be
     * undone for exactly the players it was meant to slow down.
     *
     * The lever is the roll this function already makes. Every player gets a
     * random top speed and acceleration on every line-up, and all this does is
     * lean the whole band one way: the offense slower and the defense quicker
     * when the visitor is dominating, and the reverse when he is struggling.
     * Nothing new is invented and the ported arithmetic above is untouched.
     *
     * INJECTED, NEVER IMPORTED, like `collisionScale` and the audio: it arrives
     * on the settings object this class is already constructed with, and
     * defaults to no lean at all, which is the 2D game's own behaviour.
     */
    const lean = this.settings && this.settings.difficulty;
    const swing = this.settings && this.settings.difficultySwing;
    if (typeof lean === 'number' && lean !== 0 && typeof swing === 'number' && swing > 0) {
      // Team 0 is the offense, and the visitor is always on offense.
      const bias = 1 + swing * lean * (team === 0 ? -1 : 1);
      accel *= bias;
      maxSpeed *= bias;
    }

    return {
      anim: 'formation',
      coords: {
        startX: 0,
        startY: 0,
        x: -100,
        y: -50,
        z: 1
      },
      physics: {
        accel,
        decel,
        maxSpeed,
        xMulti: 1,
        yMulti: 1
      },
      settings: {
        player,
        position,
        positionGroup,
        route: null,
        tackled,
        team,
        type: 'text'
      },
      state: {
        break: false,
        direction: '',
        directionChange: 0,
        formation: '',
        hasBall: false,
        run: false,
        tackle: 0,
        xSpeed: 0,
        ySpeed: 0
      },
      style: {
        height: 23,
        width: 12,
        text:{
          font
        }
      }
    };
  }

  setContainerDimensions(height = 0, width = 0, gutterX = 0, gutterY = 0) {
    this.state.container.gutters.x = gutterX;
    this.state.container.gutters.y = gutterY;
    this.state.container.height = height - gutterY;
    this.state.container.width = width - gutterX;
    this.state.container.x = (this.state.container.width / 2);
    this.state.container.y = ((this.state.container.height - (gutterY * 5)) / 2);
  }

  // eslint-disable-next-line
  setObjectFormationPosition(objects = [], obj = {}, formation = '') {
    const lineInterval = ((this.state.container.width - (this.settings.style.gutters.x * 10)) / 5);
    switch ( obj.settings.position ) {
      case 'db1':
        this.formationRouteDb1(obj, formation, lineInterval);
        break;
      case 'db2':
        this.formationRouteDb2(obj, formation, lineInterval);
        break;
      case 'db3':
        this.formationRouteDb3(obj, formation, lineInterval);
        break;
      case 'db4':
        this.formationRouteDb4(obj, formation, lineInterval);
        break;
      case 'db5':
        // this.formationRouteDb5(obj, formation, lineInterval);
        break;
      case 'db6':
        this.formationRouteDb6(obj, formation, lineInterval);
        break;
      case 'qb':
        obj.state.hasBall = true;
        this.formationRouteQb(obj, formation, lineInterval);
        break;
      case 's1':
        this.formationRouteS1(obj, formation, lineInterval);
        break;
      case 's2':
        this.formationRouteS2(obj, formation, lineInterval);
        break;
      case 'wr1':
        this.formationRouteWr1(obj, formation, lineInterval);
        break;
      case 'wr2':
        this.formationRouteWr2(obj, formation, lineInterval);
        break;
      case 'wr3':
        this.formationRouteWr3(obj, formation, lineInterval);
        break;
      case 'wr4':
        this.formationRouteWr4(obj, formation, lineInterval);
        break;
      case 'x1':
        this.formationRouteX1(obj, formation, lineInterval);
        break;
      case 'x2':
        this.formationRouteX2(obj, formation, lineInterval);
        break;
      case 'x3':
        this.formationRouteX3(obj, formation, lineInterval);
        break;
      case 'x4':
        this.formationRouteX4(obj, formation, lineInterval);
        break;
      case 'x5':
        this.formationRouteX5(obj, formation, lineInterval);
        break;
      case 'x6':
        this.formationRouteX6(obj, formation, lineInterval);
        break;
      default:
        break;
    }
    if ( !formation ) {
      obj.coords.x = -100;
      obj.coords.y = -50;
    } else {
      obj.state.formation = formation;
      this.coverFormationOverride(objects, obj);
    }
    obj.coords.startX = obj.coords.x;
    obj.coords.startY = obj.coords.y;
  }

  setTeamFormation(objects = [], team = 0, formation = '') {
    if ( typeof(formation) === 'undefined' || !formation ) {
      if ( team === 1 ) {
        // Defense.
        const formationIndex = Math.floor(Math.random() * this.defense.length);
        if ( this.defense[formationIndex] !== 'undefined' ) {
          formation = this.defense[formationIndex];
        }
      }
    }
    this.state.formation = formation;
    this.gameState.state.formations[team] = formation;
    objects.forEach(obj => {
      if ( obj.settings.team === team ) {
        this.setObjectFormationPosition(objects, obj, formation);
      }
    });
  }
}
