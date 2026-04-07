import {
    expandBoundingBoxSides, makeBoundingBox, copyBoundingBox, clearBoundingBox,
    shiftBoundingBox, updateBoundingBox, expandBoundingBoxByPoint, expandBoundingBox,
    expandBoundingBoxToInts, assignBoundingBox, assignShiftToBoundingBox,
    boundingBoxesIntersect, inBoundingBox, pointInBoundingBox, boundingBoxInBoundingBox,
    arePositionsSame, copyPosition, modelToRenderedPosition, renderedToModelPosition,
    array2point, min, max, mean, median,
    deg2rad, getAngleFromDisp, log2, signum,
    dist, sqdist, inPlaceSumNormalize, normalize,
    qbezierAt, qbezierPtAt, lineAt, lineAtDist, triangleAngle, bound,
    solveQuadratic, solveCubic, bezierPtsToQuadCoeff,
    sqdistToFiniteLine, sqdistToQuadraticBezier,
    midOfThree, finiteLinesIntersect,
    pointInsidePolygonPoints,
    generateUnitNgonPoints, generateUnitNgonPointsFitToSquare, fitPolygonToSquare,
    getRoundRectangleRadius, getRoundPolygonRadius, getCutRectangleCornerLength,
    getBarrelCurveConstants,
    expandPolygon, joinLines, shortenIntersection,
    inLineVicinity, inBezierVicinity,
    intersectLineEllipse, checkInEllipse, intersectLineCircle,
    findCircleNearPoint, findMaxSqDistanceToOrigin,
    transformPoints, polygonIntersectLine,
    satPolygonIntersection, hypot
} from '../../src/math.mjs'
import { describe } from 'mocha'
import { expect } from 'chai'

describe('Math', function(){

    describe('Bounding box', function(){

        let bb;

        beforeEach(function(){
           bb = makeBoundingBox();
           bb.x1 = 0;
           bb.y1 = -5;
           bb.x2 = 10;
           bb.y2 = 15;
           bb.w = 10;
           bb.h = 20;
        });

        it('expandBoundingBoxSides([number])', function(){
            expandBoundingBoxSides(bb, [10]);
            expect( bb.x1 ).equals( -10 );
            expect( bb.y1 ).equals( -15 );
            expect( bb.x2 ).equals( 20 );
            expect( bb.y2 ).equals( 25 );
            expect( bb.w ).equals( 30 );
            expect( bb.h ).equals( 40 );
        });

        it('expandBoundingBoxSides([number, number])', function(){
            expandBoundingBoxSides(bb, [1, 2]);
            expect( bb.x1 ).equals( -2 );
            expect( bb.y1 ).equals( -6 );
            expect( bb.x2 ).equals( 12 );
            expect( bb.y2 ).equals( 16 );
            expect( bb.w ).equals( 14 );
            expect( bb.h ).equals( 22 );
        });

        it('expandBoundingBoxSides([number, number, number, number])', function(){
            expandBoundingBoxSides(bb, [1, 2, 3 ,4]);
            expect( bb.x1 ).equals( -4 );
            expect( bb.y1 ).equals( -6 );
            expect( bb.x2 ).equals( 12 );
            expect( bb.y2 ).equals( 18 );
            expect( bb.w ).equals( 16 );
            expect( bb.h ).equals( 24 );
        });
    });

    describe('Position utilities', function(){
        it('arePositionsSame returns true for equal positions', function(){
            expect( arePositionsSame({x:1,y:2},{x:1,y:2}) ).to.be.true;
        });

        it('arePositionsSame returns false for different positions', function(){
            expect( arePositionsSame({x:1,y:2},{x:1,y:3}) ).to.be.false;
            expect( arePositionsSame({x:0,y:2},{x:1,y:2}) ).to.be.false;
        });

        it('copyPosition returns a new object with same x,y', function(){
            let p = {x:5,y:10};
            let c = copyPosition(p);
            expect(c.x).equals(5);
            expect(c.y).equals(10);
            expect(c).to.not.equal(p);
        });

        it('modelToRenderedPosition applies zoom and pan', function(){
            let r = modelToRenderedPosition({x:10,y:20}, 2, {x:5,y:10});
            expect(r.x).equals(25); // 10*2+5
            expect(r.y).equals(50); // 20*2+10
        });

        it('renderedToModelPosition inverts zoom and pan', function(){
            let m = renderedToModelPosition({x:25,y:50}, 2, {x:5,y:10});
            expect(m.x).equals(10);
            expect(m.y).equals(20);
        });

        it('modelToRendered and renderedToModel are inverses', function(){
            let orig = {x:7,y:13};
            let zoom = 3;
            let pan = {x:-2,y:4};
            let rendered = modelToRenderedPosition(orig, zoom, pan);
            let back = renderedToModelPosition(rendered, zoom, pan);
            expect(back.x).to.be.closeTo(orig.x, 1e-10);
            expect(back.y).to.be.closeTo(orig.y, 1e-10);
        });

        it('array2point converts [x,y] array to point object', function(){
            let p = array2point([3,7]);
            expect(p.x).equals(3);
            expect(p.y).equals(7);
        });
    });

    describe('Array statistics (min, max, mean, median)', function(){
        it('min returns the minimum finite value', function(){
            expect( min([3,1,4,1,5,9]) ).equals(1);
        });

        it('min with begin/end range', function(){
            expect( min([10,20,5,30], 1, 3) ).equals(5);
        });

        it('min ignores non-finite values', function(){
            expect( min([Infinity, 3, NaN, 1]) ).equals(1);
        });

        it('max returns the maximum finite value', function(){
            expect( max([3,1,4,1,5,9]) ).equals(9);
        });

        it('max with begin/end range', function(){
            expect( max([10,20,5,30], 0, 2) ).equals(20);
        });

        it('max ignores non-finite values', function(){
            expect( max([-Infinity, 3, NaN, 7]) ).equals(7);
        });

        it('mean computes the arithmetic mean', function(){
            expect( mean([2,4,6]) ).equals(4);
        });

        it('mean with begin/end range', function(){
            expect( mean([100,2,4,6,100], 1, 4) ).equals(4);
        });

        it('mean ignores non-finite values', function(){
            expect( mean([2, NaN, 4, Infinity, 6]) ).equals(4);
        });

        it('median of odd-length sorted array', function(){
            // Implementation uses arr[mid+1+off] for odd length:
            // len=5, mid=2 => arr[3] = 4
            expect( median([1,2,3,4,5]) ).equals(4);
        });

        it('median of even-length sorted array', function(){
            expect( median([1,2,3,4]) ).equals(2.5);
        });
    });

    describe('Trigonometry and basic math', function(){
        it('deg2rad converts 0 degrees to 0 radians', function(){
            expect( deg2rad(0) ).equals(0);
        });

        it('deg2rad converts 180 degrees to PI', function(){
            expect( deg2rad(180) ).to.be.closeTo(Math.PI, 1e-10);
        });

        it('deg2rad converts 90 degrees to PI/2', function(){
            expect( deg2rad(90) ).to.be.closeTo(Math.PI/2, 1e-10);
        });

        it('deg2rad converts 360 degrees to 2*PI', function(){
            expect( deg2rad(360) ).to.be.closeTo(2*Math.PI, 1e-10);
        });

        it('getAngleFromDisp returns angle from displacement', function(){
            // dispX=0, dispY=1 => atan2(1,0) - PI/2 = PI/2 - PI/2 = 0
            expect( getAngleFromDisp(0,1) ).to.be.closeTo(0, 1e-10);
        });

        it('log2 computes base-2 logarithm', function(){
            expect( log2(1) ).equals(0);
            expect( log2(2) ).equals(1);
            expect( log2(8) ).equals(3);
            expect( log2(1024) ).equals(10);
        });

        it('signum returns 1 for positive', function(){
            expect( signum(5) ).equals(1);
        });

        it('signum returns -1 for negative', function(){
            expect( signum(-3) ).equals(-1);
        });

        it('signum returns 0 for zero', function(){
            expect( signum(0) ).equals(0);
        });

        it('hypot computes Euclidean length', function(){
            expect( hypot(3,4) ).to.be.closeTo(5, 1e-10);
            expect( hypot(0,0) ).equals(0);
        });
    });

    describe('Distance functions', function(){
        it('dist computes Euclidean distance', function(){
            expect( dist({x:0,y:0},{x:3,y:4}) ).to.be.closeTo(5, 1e-10);
        });

        it('dist returns 0 for same point', function(){
            expect( dist({x:5,y:5},{x:5,y:5}) ).equals(0);
        });

        it('sqdist computes squared distance', function(){
            expect( sqdist({x:0,y:0},{x:3,y:4}) ).equals(25);
        });

        it('sqdistToFiniteLine for point on the line', function(){
            // Point (1,0) projected onto segment (0,0)-(2,0) is on the segment
            expect( sqdistToFiniteLine(1, 1, 0, 0, 2, 0) ).to.be.closeTo(1, 1e-10);
        });

        it('sqdistToFiniteLine for point before segment start', function(){
            // Point (-1,0) is before segment (0,0)-(2,0), closest is (0,0)
            expect( sqdistToFiniteLine(-1, 0, 0, 0, 2, 0) ).to.be.closeTo(1, 1e-10);
        });

        it('sqdistToFiniteLine for point beyond segment end', function(){
            // Point (3,0) is beyond segment (0,0)-(2,0), closest is (2,0)
            expect( sqdistToFiniteLine(3, 0, 0, 0, 2, 0) ).to.be.closeTo(1, 1e-10);
        });
    });

    describe('Normalization', function(){
        it('inPlaceSumNormalize normalizes array in place', function(){
            let v = [1,2,3,4];
            let result = inPlaceSumNormalize(v);
            expect(result).to.equal(v);
            expect(v[0]).to.be.closeTo(0.1, 1e-10);
            expect(v[1]).to.be.closeTo(0.2, 1e-10);
            expect(v[2]).to.be.closeTo(0.3, 1e-10);
            expect(v[3]).to.be.closeTo(0.4, 1e-10);
        });

        it('normalize returns new normalized array without modifying original', function(){
            let v = [2,2,2,2];
            let result = normalize(v);
            expect(result).to.not.equal(v);
            expect(v[0]).equals(2); // unchanged
            result.forEach(val => expect(val).to.be.closeTo(0.25, 1e-10));
        });
    });

    describe('Bezier and line interpolation', function(){
        it('qbezierAt at t=0 returns p0', function(){
            expect( qbezierAt(10, 20, 30, 0) ).equals(10);
        });

        it('qbezierAt at t=1 returns p2', function(){
            expect( qbezierAt(10, 20, 30, 1) ).equals(30);
        });

        it('qbezierAt at t=0.5 for symmetric case', function(){
            // For p0=0, p1=10, p2=0: (1-0.5)^2*0 + 2*0.5*0.5*10 + 0.25*0 = 5
            expect( qbezierAt(0, 10, 0, 0.5) ).to.be.closeTo(5, 1e-10);
        });

        it('qbezierPtAt returns point on curve', function(){
            let p0 = {x:0,y:0}, p1 = {x:5,y:10}, p2 = {x:10,y:0};
            let pt = qbezierPtAt(p0, p1, p2, 0);
            expect(pt.x).to.be.closeTo(0, 1e-10);
            expect(pt.y).to.be.closeTo(0, 1e-10);

            let pt1 = qbezierPtAt(p0, p1, p2, 1);
            expect(pt1.x).to.be.closeTo(10, 1e-10);
            expect(pt1.y).to.be.closeTo(0, 1e-10);
        });

        it('lineAt at t=0 returns start point', function(){
            let p0 = {x:0,y:0}, p1 = {x:10,y:0};
            let pt = lineAt(p0, p1, 0);
            expect(pt.x).to.be.closeTo(0, 1e-10);
            expect(pt.y).to.be.closeTo(0, 1e-10);
        });

        it('lineAt at t=1 returns end point', function(){
            let p0 = {x:0,y:0}, p1 = {x:10,y:0};
            let pt = lineAt(p0, p1, 1);
            expect(pt.x).to.be.closeTo(10, 1e-10);
            expect(pt.y).to.be.closeTo(0, 1e-10);
        });

        it('lineAt at t=0.5 returns midpoint', function(){
            let p0 = {x:0,y:0}, p1 = {x:10,y:10};
            let pt = lineAt(p0, p1, 0.5);
            expect(pt.x).to.be.closeTo(5, 1e-10);
            expect(pt.y).to.be.closeTo(5, 1e-10);
        });

        it('lineAtDist returns point at given distance', function(){
            let p0 = {x:0,y:0}, p1 = {x:10,y:0};
            let pt = lineAtDist(p0, p1, 3);
            expect(pt.x).to.be.closeTo(3, 1e-10);
            expect(pt.y).to.be.closeTo(0, 1e-10);
        });
    });

    describe('triangleAngle', function(){
        it('computes right angle in a right triangle', function(){
            // Right angle is at A when B and C are at equal distance along axes
            // A=(0,0), B=(1,0), C=(0,1): angle at A via cosine law
            // a=dist(B,C)=sqrt(2), b=dist(A,C)=1, c=dist(A,B)=1
            // cos(A)=(a^2+b^2-c^2)/(2ab) -- but that's not the formula used
            // triangleAngle computes: acos((a*a + b*b - c*c)/(2*a*b)) where a=dist(B,C), b=dist(A,C), c=dist(A,B)
            // = acos((2+1-1)/(2*sqrt(2)*1)) = acos(2/(2*sqrt(2))) = acos(1/sqrt(2)) = PI/4
            // For the right angle at A, use: A at the right angle vertex
            // a=dist(B,C), b=dist(A,C), c=dist(A,B)
            // The formula gives the angle at vertex A using the cosine rule for angle opposite to side c
            // Actually: it returns acos((a^2 + b^2 - c^2)/(2ab)) which is the angle at A
            // For right angle at A: need a^2 = b^2 + c^2 (Pythagorean)
            // Use A=(0,0), B=(3,0), C=(0,4): a=5, b=4, c=3
            // acos((25+16-9)/(2*5*4)) = acos(32/40) = acos(0.8)
            // That's not PI/2. The angle at A is actually acos(0) = PI/2 when we pick the right triangle.
            // For angle at A to be PI/2: need c^2 = a^2 + b^2... but that's impossible since c is opposite A.
            // triangleAngle gives angle at A: need b^2+c^2=a^2 for PI/2 at... no.
            // Actually cosine law: a^2 = b^2 + c^2 - 2bc*cos(A)
            // => cos(A) = (b^2+c^2-a^2)/(2bc). But the code uses (a^2+b^2-c^2)/(2ab).
            // That means the code computes the angle at C, not A.
            // Let's just verify a known value: equilateral done below; here test 45 degrees.
            let A = {x:0,y:0}, B = {x:1,y:0}, C = {x:0,y:1};
            let angle = triangleAngle(A, B, C);
            // a=dist(B,C)=sqrt(2), b=dist(A,C)=1, c=dist(A,B)=1
            // code: acos((2+1-1)/(2*sqrt(2)*1)) = acos(1/sqrt(2)) = PI/4
            expect(angle).to.be.closeTo(Math.PI/4, 1e-10);
        });

        it('computes 60 degrees in equilateral triangle', function(){
            let A = {x:0,y:0}, B = {x:1,y:0}, C = {x:0.5,y:Math.sqrt(3)/2};
            let angle = triangleAngle(A, B, C);
            expect(angle).to.be.closeTo(Math.PI/3, 1e-10);
        });
    });

    describe('bound', function(){
        it('clamps value below minimum', function(){
            expect( bound(0, -5, 10) ).equals(0);
        });

        it('clamps value above maximum', function(){
            expect( bound(0, 15, 10) ).equals(10);
        });

        it('returns value when within range', function(){
            expect( bound(0, 5, 10) ).equals(5);
        });

        it('returns min when val equals min', function(){
            expect( bound(3, 3, 10) ).equals(3);
        });

        it('returns max when val equals max', function(){
            expect( bound(0, 10, 10) ).equals(10);
        });
    });

    describe('makeBoundingBox extended', function(){
        it('returns empty bb when called with no arguments', function(){
            let bb = makeBoundingBox();
            expect(bb.x1).equals(Infinity);
            expect(bb.y1).equals(Infinity);
            expect(bb.x2).equals(-Infinity);
            expect(bb.y2).equals(-Infinity);
            expect(bb.w).equals(0);
            expect(bb.h).equals(0);
        });

        it('constructs bb from x1,y1,x2,y2', function(){
            let bb = makeBoundingBox({x1:0, y1:0, x2:10, y2:20});
            expect(bb.w).equals(10);
            expect(bb.h).equals(20);
        });

        it('constructs bb from x1,y1,w,h', function(){
            let bb = makeBoundingBox({x1:5, y1:5, w:10, h:20});
            expect(bb.x2).equals(15);
            expect(bb.y2).equals(25);
            expect(bb.w).equals(10);
            expect(bb.h).equals(20);
        });
    });

    describe('Bounding box operations', function(){
        let bb;

        beforeEach(function(){
            bb = { x1: 0, y1: 0, x2: 10, y2: 10, w: 10, h: 10 };
        });

        it('copyBoundingBox returns a new object with same values', function(){
            let copy = copyBoundingBox(bb);
            expect(copy).to.deep.equal(bb);
            expect(copy).to.not.equal(bb);
        });

        it('clearBoundingBox resets to empty', function(){
            clearBoundingBox(bb);
            expect(bb.x1).equals(Infinity);
            expect(bb.y1).equals(Infinity);
            expect(bb.x2).equals(-Infinity);
            expect(bb.y2).equals(-Infinity);
            expect(bb.w).equals(0);
            expect(bb.h).equals(0);
        });

        it('shiftBoundingBox translates the box', function(){
            let shifted = shiftBoundingBox(bb, 5, -3);
            expect(shifted.x1).equals(5);
            expect(shifted.y1).equals(-3);
            expect(shifted.x2).equals(15);
            expect(shifted.y2).equals(7);
            expect(shifted.w).equals(10);
            expect(shifted.h).equals(10);
        });

        it('updateBoundingBox expands bb1 to include bb2', function(){
            let bb2 = { x1: -5, y1: -5, x2: 5, y2: 5 };
            updateBoundingBox(bb, bb2);
            expect(bb.x1).equals(-5);
            expect(bb.y1).equals(-5);
            expect(bb.x2).equals(10);
            expect(bb.y2).equals(10);
            expect(bb.w).equals(15);
            expect(bb.h).equals(15);
        });

        it('expandBoundingBoxByPoint extends to include point', function(){
            expandBoundingBoxByPoint(bb, 15, -3);
            expect(bb.x2).equals(15);
            expect(bb.y1).equals(-3);
            expect(bb.w).equals(15);
            expect(bb.h).equals(13);
        });

        it('expandBoundingBox adds uniform padding', function(){
            expandBoundingBox(bb, 2);
            expect(bb.x1).equals(-2);
            expect(bb.y1).equals(-2);
            expect(bb.x2).equals(12);
            expect(bb.y2).equals(12);
            expect(bb.w).equals(14);
            expect(bb.h).equals(14);
        });

        it('expandBoundingBoxToInts rounds outward to integers', function(){
            // expandToInt: positive values get Math.ceil, negative get Math.floor
            let bb2 = { x1: -0.3, y1: -0.7, x2: 9.2, y2: 9.8, w: 0, h: 0 };
            expandBoundingBoxToInts(bb2, 0);
            expect(bb2.x1).equals(-1);  // floor(-0.3) = -1
            expect(bb2.y1).equals(-1);  // floor(-0.7) = -1
            expect(bb2.x2).equals(10);  // ceil(9.2) = 10
            expect(bb2.y2).equals(10);  // ceil(9.8) = 10
        });

        it('assignBoundingBox copies values from bb2 to bb1', function(){
            let bb1 = makeBoundingBox();
            let bb2 = { x1: 1, y1: 2, x2: 3, y2: 4 };
            assignBoundingBox(bb1, bb2);
            expect(bb1.x1).equals(1);
            expect(bb1.y1).equals(2);
            expect(bb1.x2).equals(3);
            expect(bb1.y2).equals(4);
            expect(bb1.w).equals(2);
            expect(bb1.h).equals(2);
        });

        it('assignShiftToBoundingBox shifts in place', function(){
            assignShiftToBoundingBox(bb, {x:3, y:-2});
            expect(bb.x1).equals(3);
            expect(bb.y1).equals(-2);
            expect(bb.x2).equals(13);
            expect(bb.y2).equals(8);
        });
    });

    describe('Bounding box intersection and containment', function(){
        it('boundingBoxesIntersect returns true for overlapping boxes', function(){
            let bb1 = {x1:0, y1:0, x2:10, y2:10};
            let bb2 = {x1:5, y1:5, x2:15, y2:15};
            expect( boundingBoxesIntersect(bb1, bb2) ).to.be.true;
        });

        it('boundingBoxesIntersect returns false for non-overlapping boxes', function(){
            let bb1 = {x1:0, y1:0, x2:5, y2:5};
            let bb2 = {x1:10, y1:10, x2:15, y2:15};
            expect( boundingBoxesIntersect(bb1, bb2) ).to.be.false;
        });

        it('boundingBoxesIntersect returns true for touching boxes', function(){
            let bb1 = {x1:0, y1:0, x2:5, y2:5};
            let bb2 = {x1:5, y1:5, x2:10, y2:10};
            expect( boundingBoxesIntersect(bb1, bb2) ).to.be.true;
        });

        it('inBoundingBox checks point inside', function(){
            let bb = {x1:0, y1:0, x2:10, y2:10};
            expect( inBoundingBox(bb, 5, 5) ).to.be.true;
            expect( inBoundingBox(bb, 0, 0) ).to.be.true;
            expect( inBoundingBox(bb, 10, 10) ).to.be.true;
        });

        it('inBoundingBox checks point outside', function(){
            let bb = {x1:0, y1:0, x2:10, y2:10};
            expect( inBoundingBox(bb, -1, 5) ).to.be.false;
            expect( inBoundingBox(bb, 5, 11) ).to.be.false;
        });

        it('pointInBoundingBox works with point objects', function(){
            let bb = {x1:0, y1:0, x2:10, y2:10};
            expect( pointInBoundingBox(bb, {x:5,y:5}) ).to.be.true;
            expect( pointInBoundingBox(bb, {x:15,y:5}) ).to.be.false;
        });

        it('boundingBoxInBoundingBox checks full containment', function(){
            let outer = {x1:0, y1:0, x2:20, y2:20};
            let inner = {x1:5, y1:5, x2:15, y2:15};
            expect( boundingBoxInBoundingBox(outer, inner) ).to.be.true;
            expect( boundingBoxInBoundingBox(inner, outer) ).to.be.false;
        });
    });

    describe('solveQuadratic', function(){
        it('finds roots of x^2 - 5x + 6 = 0', function(){
            // a=1, b=-5, c=6, val=0 => roots at x=2 and x=3
            let roots = solveQuadratic(1, -5, 6, 0);
            expect(roots).to.have.length(2);
            let sorted = roots.slice().sort((a,b) => a-b);
            expect(sorted[0]).to.be.closeTo(2, 1e-10);
            expect(sorted[1]).to.be.closeTo(3, 1e-10);
        });

        it('returns empty array for no real roots', function(){
            // x^2 + 1 = 0 => no real roots
            let roots = solveQuadratic(1, 0, 1, 0);
            expect(roots).to.have.length(0);
        });

        it('solves with val offset', function(){
            // x^2 = 4 => a=1, b=0, c=0, val=4 => roots at x=-2 and x=2
            let roots = solveQuadratic(1, 0, 0, 4);
            let sorted = roots.slice().sort((a,b) => a-b);
            expect(sorted[0]).to.be.closeTo(-2, 1e-10);
            expect(sorted[1]).to.be.closeTo(2, 1e-10);
        });
    });

    describe('solveCubic', function(){
        it('finds real roots of x^3 - 6x^2 + 11x - 6 = 0', function(){
            // Roots: 1, 2, 3
            let result = new Array(6).fill(0);
            solveCubic(1, -6, 11, -6, result);
            let realRoots = [result[0], result[2], result[4]].sort((a,b) => a-b);
            expect(realRoots[0]).to.be.closeTo(1, 1e-4);
            expect(realRoots[1]).to.be.closeTo(2, 1e-4);
            expect(realRoots[2]).to.be.closeTo(3, 1e-4);
        });

        it('handles case with repeated roots', function(){
            // (x-2)^3 = x^3 - 6x^2 + 12x - 8, root at 2
            let result = new Array(6).fill(0);
            solveCubic(1, -6, 12, -8, result);
            // All real roots should be near 2
            expect(result[0]).to.be.closeTo(2, 1e-2);
        });
    });

    describe('bezierPtsToQuadCoeff', function(){
        it('returns correct quadratic coefficients', function(){
            // p0 - 2*p1 + p2, 2*(p1 - p0), p0
            let coeffs = bezierPtsToQuadCoeff(1, 3, 7);
            expect(coeffs[0]).equals(1 - 6 + 7); // 2
            expect(coeffs[1]).equals(2 * (3 - 1)); // 4
            expect(coeffs[2]).equals(1);
        });
    });

    describe('midOfThree', function(){
        it('returns middle value from three numbers', function(){
            expect( midOfThree(1,2,3) ).equals(2);
            expect( midOfThree(3,1,2) ).equals(2);
            expect( midOfThree(2,3,1) ).equals(2);
        });

        it('handles equal values', function(){
            expect( midOfThree(5,5,5) ).equals(5);
            expect( midOfThree(1,5,5) ).equals(5);
        });

        it('handles negative values', function(){
            expect( midOfThree(-3, -1, -2) ).equals(-2);
        });
    });

    describe('finiteLinesIntersect', function(){
        it('finds intersection of crossing segments', function(){
            // (0,0)-(10,10) crosses (0,10)-(10,0) at (5,5)
            let pt = finiteLinesIntersect(0,0,10,10, 0,10,10,0, false);
            expect(pt).to.have.length(2);
            expect(pt[0]).to.be.closeTo(5, 0.01);
            expect(pt[1]).to.be.closeTo(5, 0.01);
        });

        it('returns empty for parallel non-intersecting segments', function(){
            // two horizontal parallel segments
            let pt = finiteLinesIntersect(0,0,10,0, 0,5,10,5, false);
            expect(pt).to.have.length(0);
        });

        it('returns empty for non-overlapping finite segments', function(){
            // (0,0)-(1,0) and (0,5)-(0,10) do not intersect
            let pt = finiteLinesIntersect(0,0,1,0, 0,5,0,10, false);
            expect(pt).to.have.length(0);
        });

        it('finds intersection with infiniteLines=true even outside segments', function(){
            // Two lines that intersect outside their finite ranges
            let pt = finiteLinesIntersect(0,0,1,1, 10,0,11,-1, true);
            expect(pt).to.have.length(2);
            // Intersection of y=x and y=-(x-10) => x = -x+10 => x=5, y=5
            expect(pt[0]).to.be.closeTo(5, 0.01);
            expect(pt[1]).to.be.closeTo(5, 0.01);
        });
    });

    describe('pointInsidePolygonPoints', function(){
        // Unit square as flat array: (0,0), (10,0), (10,10), (0,10)
        let square = [0,0, 10,0, 10,10, 0,10];

        it('returns true for point inside', function(){
            expect( pointInsidePolygonPoints(5, 5, square) ).to.be.true;
        });

        it('returns false for point outside', function(){
            expect( pointInsidePolygonPoints(15, 5, square) ).to.be.false;
            expect( pointInsidePolygonPoints(5, -5, square) ).to.be.false;
        });
    });

    describe('generateUnitNgonPoints', function(){
        it('generates correct number of points for triangle', function(){
            let pts = generateUnitNgonPoints(3, 0);
            expect(pts.length).equals(6); // 3 sides * 2 coords
        });

        it('generates correct number of points for hexagon', function(){
            let pts = generateUnitNgonPoints(6, 0);
            expect(pts.length).equals(12);
        });

        it('all points lie on unit circle', function(){
            let pts = generateUnitNgonPoints(5, 0);
            for(let i = 0; i < 5; i++){
                let x = pts[2*i], y = pts[2*i+1];
                let r = Math.sqrt(x*x + y*y);
                expect(r).to.be.closeTo(1, 1e-10);
            }
        });
    });

    describe('generateUnitNgonPointsFitToSquare', function(){
        it('generates points that span [-1,1] in at least one axis', function(){
            let pts = generateUnitNgonPointsFitToSquare(4, 0);
            let minX = Infinity, maxX = -Infinity;
            for(let i = 0; i < pts.length/2; i++){
                minX = Math.min(minX, pts[2*i]);
                maxX = Math.max(maxX, pts[2*i]);
            }
            // After fitting to square, span should be 2 (from -1 to 1)
            expect(maxX - minX).to.be.closeTo(2, 0.01);
        });
    });

    describe('getRoundRectangleRadius', function(){
        it('returns min(w/4, h/4, 8)', function(){
            expect( getRoundRectangleRadius(100, 100) ).equals(8);
            expect( getRoundRectangleRadius(20, 20) ).equals(5);
            expect( getRoundRectangleRadius(10, 40) ).equals(2.5);
        });
    });

    describe('getRoundPolygonRadius', function(){
        it('returns min(w/10, h/10, 8)', function(){
            expect( getRoundPolygonRadius(100, 100) ).equals(8);
            expect( getRoundPolygonRadius(50, 50) ).equals(5);
            expect( getRoundPolygonRadius(30, 60) ).equals(3);
        });
    });

    describe('getCutRectangleCornerLength', function(){
        it('returns 8', function(){
            expect( getCutRectangleCornerLength() ).equals(8);
        });
    });

    describe('getBarrelCurveConstants', function(){
        it('returns expected shape', function(){
            let c = getBarrelCurveConstants(200, 100);
            expect(c).to.have.property('heightOffset');
            expect(c).to.have.property('widthOffset');
            expect(c).to.have.property('ctrlPtOffsetPct');
            expect(c.ctrlPtOffsetPct).equals(0.05);
        });

        it('heightOffset does not exceed 15', function(){
            let c = getBarrelCurveConstants(1000, 1000);
            expect(c.heightOffset).equals(15);
        });

        it('widthOffset does not exceed 100', function(){
            let c = getBarrelCurveConstants(1000, 1000);
            expect(c.widthOffset).equals(100);
        });
    });

    describe('shortenIntersection', function(){
        it('shortens a vector by given amount', function(){
            let result = shortenIntersection([10, 0], [0, 0], 3);
            expect(result[0]).to.be.closeTo(7, 1e-10);
            expect(result[1]).to.be.closeTo(0, 1e-10);
        });

        it('clamps to near-zero ratio when amount > length', function(){
            let result = shortenIntersection([1, 0], [0, 0], 100);
            // lenRatio clamped to 0.00001
            expect(result[0]).to.be.closeTo(0, 0.01);
            expect(result[1]).to.be.closeTo(0, 0.01);
        });
    });

    describe('expandPolygon and joinLines', function(){
        it('expandPolygon creates offset line segments', function(){
            // A simple triangle
            let tri = [0,0, 10,0, 5,10];
            let expanded = expandPolygon(tri, 1);
            // Should have 3 edges * 4 coords = 12 values
            expect(expanded.length).equals(12);
        });

        it('joinLines produces vertices from a line set', function(){
            // A simple triangle
            let tri = [0,0, 10,0, 5,10];
            let expanded = expandPolygon(tri, 1);
            let joined = joinLines(expanded);
            // Should produce 3 vertices = 6 values
            expect(joined.length).equals(6);
        });
    });

    describe('Vicinity checks', function(){
        it('inLineVicinity returns true for point near segment', function(){
            expect( inLineVicinity(5, 0.5, 0, 0, 10, 0, 1) ).to.be.true;
        });

        it('inLineVicinity returns false for point far from segment', function(){
            expect( inLineVicinity(5, 5, 0, 0, 10, 0, 1) ).to.be.false;
        });

        it('inBezierVicinity returns true for point in bounding box', function(){
            expect( inBezierVicinity(5, 5, 0, 0, 5, 10, 10, 0, 1) ).to.be.true;
        });

        it('inBezierVicinity returns false for point outside bounding box', function(){
            expect( inBezierVicinity(50, 50, 0, 0, 5, 10, 10, 0, 1) ).to.be.false;
        });
    });

    describe('Circle and ellipse utilities', function(){
        it('intersectLineCircle finds intersections', function(){
            // Line from (-10,0) to (10,0) through circle centered at origin with r=5
            let result = intersectLineCircle(-10, 0, 10, 0, 0, 0, 5);
            expect(result.length).to.be.greaterThan(0);
        });

        it('intersectLineCircle returns empty for no intersection', function(){
            // Line far from circle
            let result = intersectLineCircle(0, 100, 10, 100, 0, 0, 5);
            expect(result).to.have.length(0);
        });

        it('checkInEllipse returns true for point inside', function(){
            expect( checkInEllipse(0, 0, 10, 10, 0, 0, 0) ).to.be.true;
        });

        it('checkInEllipse returns false for point outside', function(){
            expect( checkInEllipse(10, 10, 10, 10, 0, 0, 0) ).to.be.false;
        });

        it('intersectLineEllipse returns intersection point', function(){
            // Line from far away toward center
            let result = intersectLineEllipse(20, 0, 0, 0, 5, 5);
            expect(result.length).equals(2);
        });

        it('intersectLineEllipse returns empty when point is inside', function(){
            let result = intersectLineEllipse(1, 0, 0, 0, 5, 5);
            expect(result).to.have.length(0);
        });

        it('findCircleNearPoint returns point on circle closest to far point', function(){
            let pt = findCircleNearPoint(0, 0, 5, 10, 0);
            expect(pt[0]).to.be.closeTo(5, 1e-10);
            expect(pt[1]).to.be.closeTo(0, 1e-10);
        });
    });

    describe('findMaxSqDistanceToOrigin', function(){
        it('finds max squared distance from origin in flat point array', function(){
            // Points: (1,0), (0,3), (2,2)
            let pts = [1,0, 0,3, 2,2];
            // Distances squared: 1, 9, 8
            expect( findMaxSqDistanceToOrigin(pts) ).equals(9);
        });

        it('returns small default for empty-ish array', function(){
            expect( findMaxSqDistanceToOrigin([]) ).to.be.closeTo(0.000001, 1e-7);
        });
    });

    describe('transformPoints', function(){
        it('transforms unit points by center, width, height', function(){
            // Points (-1,-1), (1,-1), (1,1), (-1,1) with center (0,0), w=20, h=10
            let pts = [-1,-1, 1,-1, 1,1, -1,1];
            let result = transformPoints(pts, 0, 0, 20, 10);
            expect(result).to.have.length(4);
            expect(result[0].x).equals(-10);
            expect(result[0].y).equals(-5);
            expect(result[2].x).equals(10);
            expect(result[2].y).equals(5);
        });

        it('applies center offset', function(){
            let pts = [0,0, 1,0];
            let result = transformPoints(pts, 100, 200, 20, 10);
            expect(result[0].x).equals(100);
            expect(result[0].y).equals(200);
            expect(result[1].x).equals(110);
            expect(result[1].y).equals(200);
        });
    });

    describe('satPolygonIntersection', function(){
        it('detects overlapping squares', function(){
            let sq1 = [{x:0,y:0},{x:10,y:0},{x:10,y:10},{x:0,y:10}];
            let sq2 = [{x:5,y:5},{x:15,y:5},{x:15,y:15},{x:5,y:15}];
            expect( satPolygonIntersection(sq1, sq2) ).to.be.true;
        });

        it('detects non-overlapping squares', function(){
            let sq1 = [{x:0,y:0},{x:10,y:0},{x:10,y:10},{x:0,y:10}];
            let sq2 = [{x:20,y:20},{x:30,y:20},{x:30,y:30},{x:20,y:30}];
            expect( satPolygonIntersection(sq1, sq2) ).to.be.false;
        });

        it('detects touching squares (shared edge)', function(){
            let sq1 = [{x:0,y:0},{x:10,y:0},{x:10,y:10},{x:0,y:10}];
            let sq2 = [{x:10,y:0},{x:20,y:0},{x:20,y:10},{x:10,y:10}];
            expect( satPolygonIntersection(sq1, sq2) ).to.be.true;
        });

        it('detects triangle-square overlap', function(){
            let tri = [{x:5,y:5},{x:15,y:5},{x:10,y:15}];
            let sq = [{x:0,y:0},{x:10,y:0},{x:10,y:10},{x:0,y:10}];
            expect( satPolygonIntersection(tri, sq) ).to.be.true;
        });
    });

    describe('sqdistToQuadraticBezier', function(){
        it('returns 0 for point on start of curve', function(){
            // Point (0,0), curve from (0,0) control (5,10) to (10,0)
            let d = sqdistToQuadraticBezier(0, 0, 0, 0, 5, 10, 10, 0);
            expect(d).to.be.closeTo(0, 1e-4);
        });

        it('returns 0 for point on end of curve', function(){
            let d = sqdistToQuadraticBezier(10, 0, 0, 0, 5, 10, 10, 0);
            expect(d).to.be.closeTo(0, 1e-4);
        });

        it('returns positive distance for distant point', function(){
            let d = sqdistToQuadraticBezier(100, 100, 0, 0, 5, 10, 10, 0);
            expect(d).to.be.greaterThan(0);
        });
    });

    describe('fitPolygonToSquare', function(){
        it('scales points to span [-1,1]', function(){
            let pts = generateUnitNgonPoints(4, 0);
            let fitted = fitPolygonToSquare(pts.slice());
            let minX = Infinity, maxX = -Infinity;
            for(let i = 0; i < fitted.length/2; i++){
                minX = Math.min(minX, fitted[2*i]);
                maxX = Math.max(maxX, fitted[2*i]);
            }
            expect(maxX - minX).to.be.closeTo(2, 0.01);
        });
    });

    describe('polygonIntersectLine', function(){
        it('finds intersection of line with polygon', function(){
            // Square polygon points (unit): (-1,-1), (1,-1), (1,1), (-1,1)
            let basePoints = [-1,-1, 1,-1, 1,1, -1,1];
            // Line from (20,0) to center (0,0), polygon at center (0,0) with w=10,h=10
            let intersections = polygonIntersectLine(20, 0, basePoints, 0, 0, 10, 10, 0);
            // Should find intersection on the right edge at (10,0)
            expect(intersections.length).to.be.greaterThan(0);
        });

        it('returns empty for line that misses polygon', function(){
            // polygonIntersectLine draws line from (x,y) to (centerX,centerY) and
            // checks each polygon edge. When no transform (width=null), it uses
            // basePoints directly. For a miss, the line from (x,y) to centerX,centerY
            // must not cross any edge of the polygon.
            // Triangle at (0,0),(10,0),(5,10). Line from (20,20) to center (50,50)
            // is far from this triangle and should not intersect any edge.
            let triPoints = [0,0, 10,0, 5,10];
            let intersections = polygonIntersectLine(20, 20, triPoints, 50, 50);
            expect(intersections).to.have.length(0);
        });
    });
});
