// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * playstate.js - The state of one play, and the spatial queries over it.
 *
 * PORTED FROM THE 2D GAME's state.class.tsx (D2). Holds the ball, the score,
 * the round, the formations in play and the field measurements, and answers
 * the questions the route code keeps asking: which defender is closest to this
 * point, how far apart are these two, is anyone in the way.
 *
 * measurements IS THE COORDINATE CONTRACT. Everything in formations.js and
 * routes.js positions itself against `state.measurements`, which config.js
 * fills in world metres rather than canvas pixels (PLANNING section 4).
 *
 * NO THREE, NO DOM, NO GLOBALS (PLANNING D1).
 */

export class ExesAndOhsStateClass {

  constructor() {
    this.state = {
      anim: {
        done: false,
        run50: false
      },
      ball: {
        caught: false,
        position: 'qb',
        team: 0
      },
      formations: {
        0: '',
        1: ''
      },
      lastPlay: '',
      measurements: {
        gutterX: 0,
        gutterY: 0,
        height: 0,
        lineInterval: 0,
        width: 0,
        x: 0,
        y: 0
      },
      nightMode: true,
      number: 0,
      plays: [],
      result: '',
      round: 1,
      score: 0,
      summaries: [],
      tackled: false
    };
  }

  // eslint-disable-next-line
  getClosestTeamObjectToPosition(objects = [], team = 0, positionX = 0, positionY = 0, shortest = 0, positions = []) {
    let closestIndex = -1;
    const objectCount = objects.length;
    let o = 0;
    for ( o = 0; o < objectCount; o += 1 ) {
      const obj = objects[o];
      if ( obj.settings.team === team && positions.indexOf(obj.settings.position) !== -1 ) {
        const dist = this.getCoordDistance(obj.coords.x, obj.coords.y, positionX, positionY);
        if ( dist < shortest ) {
          closestIndex = o;
          shortest = dist;
        }
      }
    }
    if ( closestIndex > -1 ) {
      return objects[closestIndex];
    }
    return null;
  }

  // eslint-disable-next-line
  getClosestTeamObjectsToPosition(objects = [], team = 0, positionX = 0, positionY = 0, shortest = 0, positions = [], count = 2) {
    const objectCount = objects.length;
    const list = [];
    let o = 0;
    for ( o = 0; o < objectCount; o += 1 ) {
      const obj = objects[o];
      if ( obj.settings.team === team && positions.indexOf(obj.settings.position) !== -1 ) {
        const dist = this.getCoordDistance(obj.coords.x, obj.coords.y, positionX, positionY);
        if ( dist < shortest ) {
          list.push({
            dist,
            obj
          });
          shortest = dist;
        }
      }
    }
    list.sort((a, b) => {
      if ( a.dist < b.dist ){
        return -1;
      }
      if ( a.dist > b.dist ){
        return 1;
      }
      return 0;
    });
    const listCount = list.length;
    if ( listCount > count ) {
      list.splice(count, listCount);
    }
    return list;
  }

  getCoordDistance(x1 = 0, y1 = 0, x2 = 0, y2 = 0) {
    return Math.ceil(
      Math.sqrt(
        ( Math.pow((x1 - x2), 2) + Math.pow((y1 - y2), 2) )
      )
    );
  }

  getGameSummary() {
    const summary = {
      finalScore: this.state.score,
      number: this.state.number,
      passResultSummary: {
        completionCount: 0,
        completionPct: 0,
        incompletionCount: 0,
        interceptionCount: 0,
        sackCount: 0
      },
      plays: this.state.plays,
      playSummary: {
        passCount: 0,
        passPct: 0,
        runCount: 0,
        runPct: 0,
        totalCount: this.state.plays.length
      },
      pointsSummary: {
        compPoints: 0,
        intPoints: 0,
        minPoints: -1,
        maxPoints: -1,
        passPoints: 0,
        passPointsPct: 0,
        runPoints: 0,
        runPointsPct: 0,
        sackPoints: 0
      },
      receiverCompletions: {},
      receiverTargets: {}
    };
    // eslint-disable-next-line
    this.state.plays.forEach((play) => {
      const points = play.points;
      const result = play.result;
      const throwTo = play.throwTo;
      if ( summary.pointsSummary.minPoints === -1 || points < summary.pointsSummary.minPoints ) {
        summary.pointsSummary.minPoints = points;
      }
      if ( summary.pointsSummary.maxPoints === -1 || points > summary.pointsSummary.maxPoints ) {
        summary.pointsSummary.maxPoints = points;
      }
      if ( throwTo ) {
        // Pass.
        summary.playSummary.passCount += 1;
        summary.pointsSummary.passPoints += points;
        if ( typeof(summary.receiverTargets[throwTo]) === 'undefined' ) {
          summary.receiverTargets[throwTo] = 1;
          summary.receiverCompletions[throwTo] = 0;
        } else {
          summary.receiverTargets[throwTo] += 1;
        }
        switch ( result ) {
          case 'incomplete-result':
            summary.passResultSummary.incompletionCount += 1;
            break;
          case 'interception-result':
            summary.pointsSummary.intPoints += points;
            summary.passResultSummary.interceptionCount += 1;
            break;
          case 'sack-result':
            summary.pointsSummary.sackPoints += points;
            summary.passResultSummary.sackCount += 1;
            break;
          default:
            summary.pointsSummary.compPoints += points;
            summary.passResultSummary.completionCount += 1;
            summary.receiverCompletions[throwTo] += 1;
            break;
        }
      } else {
        switch ( result ) {
          case 'sack-result':
            summary.pointsSummary.sackPoints += points;
            summary.passResultSummary.sackCount += 1;
            break;
          default:
            // Run.
            summary.playSummary.runCount += 1;
            summary.pointsSummary.runPoints += points;
            break;
        }
      }
    });
    if ( summary.playSummary.passCount > 0 ) {
      summary.playSummary.passPct = Math.round((summary.playSummary.passCount / summary.playSummary.totalCount) * 100);
    }
    if ( summary.playSummary.runCount > 0 ) {
      summary.playSummary.runPct = Math.round((summary.playSummary.runCount / summary.playSummary.totalCount) * 100);
    }
    if ( summary.pointsSummary.passPoints > 0 ) {
      summary.pointsSummary.passPointsPct = Math.round((summary.pointsSummary.passPoints / summary.finalScore) * 100);
    }
    if ( summary.pointsSummary.runPoints > 0 ) {
      summary.pointsSummary.runPointsPct = Math.round((summary.pointsSummary.runPoints / summary.finalScore) * 100);
    }
    if ( summary.passResultSummary.completionCount > 0 ) {
      summary.passResultSummary.completionPct = Math.round((summary.passResultSummary.completionCount / summary.playSummary.passCount) * 100);
    }
    return summary;
  }

  // eslint-disable-next-line
  getGameSummaryMarkup(summary) {
    let html = '';
    html += '<div class="summary-row">';
    html += '<div class="summary-col">';
    html += '<div class="stats-row">';
    html += '<div class="stats-label">Score:</div>';
    html += '<div class="stats-value"><b>' + String(summary.finalScore) + '</b></div>';
    html += '</div>';
    html += '<div class="stats-row">';
    html += '<div class="stats-label">High:</div>';
    html += '<div class="stats-value primary-color">' + String(this.getPersonalBest()) + '</div>';
    html += '</div>';
    html += '<div class="stats-row">';
    html += '<div class="stats-label">Low:</div>';
    html += '<div class="stats-value heads-up">' + String(this.getPersonalWorst()) + '</div>';
    html += '</div>';
    html += '<div class="stats-row">';
    html += '<div class="stats-label">Avg:</div>';
    html += '<div class="stats-value">' + String(this.getPersonalAverage()) + '</div>';
    html += '</div>';
    html += '<div class="stats-row">';
    html += '<div class="stats-label">Games:</div>';
    html += '<div class="stats-value">' + String(this.state.summaries.length) + '</div>';
    html += '</div>';
    html += '</div>';
    html += '<div class="summary-col">';
    if ( summary.playSummary.runCount > 0 ) {
      html += '<div class="stats-row">';
      html += '<div class="stats-label">Runs:</div>';
      html += '<div class="stats-value"><b>' + String(summary.playSummary.runCount) + '</b> for <b>' + String(summary.pointsSummary.runPoints) + '</b> pts</div>';
      html += '</div>';
    }
    if ( summary.playSummary.passCount > 0 ) {
      html += '<div class="stats-row">';
      html += '<div class="stats-label">Passes:</div>';
      html += '<div class="stats-value"><b>' + String(summary.playSummary.passCount) + '</b> for <b>' + String(summary.pointsSummary.passPoints) + '</b> pts</div>';
      html += '</div>';
    }
    if ( summary.passResultSummary.completionCount > 0 ) {
      html += '<div class="stats-row">';
      html += '<div class="stats-label">Comps:</div>';
      html += '<div class="stats-value"><b>' + String(summary.passResultSummary.completionCount) + '</b> for <b>' + String(summary.pointsSummary.compPoints) + '</b> pts</div>';
      html += '</div>';
    }
    if ( summary.passResultSummary.interceptionCount > 0 ) {
      html += '<div class="stats-row">';
      html += '<div class="stats-label">Ints:</div>';
      html += '<div class="stats-value"><b>' + String(summary.passResultSummary.interceptionCount) + '</b> for <b>' + String(summary.pointsSummary.intPoints) + '</b> pts</div>';
      html += '</div>';
    }
    if ( summary.passResultSummary.sackCount > 0 ) {
      html += '<div class="stats-row">';
      html += '<div class="stats-label">Sacks:</div>';
      html += '<div class="stats-value"><b>' + String(summary.passResultSummary.sackCount) + '</b> for <b>' + String(summary.pointsSummary.sackPoints) + '</b> pts</div>';
      html += '</div>';
    }
    html += '</div>';
    html += '</div>';
    return html;
  }

  // eslint-disable-next-line
  getLineCoords(A = [], B = [], throttle) {
    const slope = (a, b) => {
      if (a[0] === b[0]) {
        return null;
      }
      return (b[1] - a[1]) / (b[0] - a[0]);
    }
    const intercept = (point, slope) => {
      if (slope === null) {
        // vertical line
        return point[0];
      }
      return point[1] - slope * point[0];
    }
    const m = slope(A, B);
    const b = intercept(A, m);
    const coordinates = [];
    let counter = 0;
    for (let x = A[0]; x <= B[0]; x++) {
      const y = m !== null ? m * x + b : A[1];
      if ( !counter || (counter % throttle === 0) ) {
        coordinates.push([x, y]);
      }
      counter += 1;
    }
    return coordinates;
  }

  getMidPoint(p1, p2) {
    return (p1 + ((p2 - p1) / 2));
  }

  getPersonalAverage() {
    let avg = 0;
    const summaryCount = this.state.summaries.length;
    if ( summaryCount > 0 ) {
      let total = 0;
      // eslint-disable-next-line
      this.state.summaries.forEach((summary) => {
        const finalScore = summary.finalScore;
        total += finalScore;
      });
      avg = Math.round(total / summaryCount);
    }
    return avg;
  }

  getPersonalBest() {
    let pb = 0;
    // eslint-disable-next-line
    this.state.summaries.forEach((summary) => {
      const finalScore = summary.finalScore;
      if ( finalScore > pb ) {
        pb = finalScore;
      }
    });
    return pb;
  }

  getPersonalWorst() {
    let pw = -1;
    // eslint-disable-next-line
    this.state.summaries.forEach((summary) => {
      const finalScore = summary.finalScore;
      if ( pw === -1 || finalScore < pw ) {
        pw = finalScore;
      }
    });
    return pw;
  }

  // eslint-disable-next-line
  logSummary(summary = {}) {
    if (!this.state.summaries.length) {
      this.state.summaries.push(summary);
    } else {
      if (summary.number !== this.state.summaries[this.state.summaries.length - 1].number) {
        this.state.summaries.push(summary);
      }
    }
    if ( this.state.summaries.length > 100 ) {
      this.state.summaries.shift();
    }
  }

  // eslint-disable-next-line
  playResult(result = {}) {
    if ( typeof(result.offense) !== 'undefined' && result.offense ) {
      this.state.lastPlay = result.offense;
    }
    this.state.plays.push(result);
    if ( this.state.plays.length > 100 ) {
      this.state.plays.shift();
    }
  }

  reset() {
    this.resetPlay();
    this.state.plays.length = 0;
    this.state.result = '';
    this.state.round = 1;
    this.state.score = 0;
  }

  resetPlay() {
    this.state.anim.done = false;
    this.state.anim.run50 = false;
    this.state.ball.caught = false;
    this.state.ball.position = 'qb';
    this.state.result = '';
    this.state.ball.team = 0;
    this.state.tackled = false;
  }

  setMeasurements(containerHeight = 0, containerWidth = 0, gutterX = 0, gutterY = 0) {
    this.state.measurements.height = (containerHeight - (gutterY * 12));
    this.state.measurements.width = containerWidth;
    this.state.measurements.x = (this.state.measurements.width / 2);
    this.state.measurements.y = (this.state.measurements.height / 2);
    this.state.measurements.gutterX = gutterX;
    this.state.measurements.gutterY = gutterY;
    this.state.measurements.lineInterval = (this.state.measurements.width / 5);
  }

  toggleTheme() {
    this.state.nightMode = !this.state.nightMode;
  }
}
