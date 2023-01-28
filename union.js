const intersect = require("path-intersection")
const {SVGPathData, SVGPathDataTransformer, SVGPathDataEncoder, SVGPathDataParse, encodeSVGPath} = require('svg-pathdata');
const svg_properties = require('svg-path-properties')

function union(...paths) {
    // Handling Multiple paths
    paths = paths.join("").split(/(?=M)/gi).map( path => {
        let first_path = ""
        // Checking if the first Path has M at start or not
        if( path.search(/M/gi) == 0 ) {
            // Removing Extra path segments which don't have an M at start
            first_path = path.split(/(?<=Z)/gi)[0]
    
            // Adding Z to paths if not available already
            if( first_path.search(/Z/gi) == -1  ) {
                first_path += "Z"
            }
        }

        return {
            path: first_path,
            segments: new SVGPathData(first_path).commands
        }
    })
    
    // Making a Blank Copy of the Array
    segmented_paths = paths.map( path => Array() )
    
    var index = [0/*For Paths on left*/, 0/*For Path on right*/]
    
    // Finding Intersections between all paths and isolating them in segmented_paths
    for(index[0] = 0; index[0] < paths.length - 1; index[0]++) {
        for(index[1] = (index[0] + 1); index[1] < paths.length; index[1]++) {
            intersect(paths[index[0]].path, paths[index[1]].path).map( intersection => {
                // Assuming no relativity in the data
                // Lopping for the two paths in the intersection
                for(path_no = 1; path_no <= 2; path_no++)
                {
                    let path_index = index[path_no - 1]

                    P0 = getInitialPoint(intersection['segment' + path_no], paths[path_index])
        
                    curr_segment = paths[path_index].segments[intersection['segment' + path_no]]
        
                    new_segments = splitSegment(curr_segment, P0, intersection, paths[path_index], path_no)

                    // Assuming there are 2 new segments
                    new_segments = new_segments.map( (segment, segment_index) => {
                        segment.intersectee = (path_no == 1) ? index[1] : index[0] // OR segment.intersectee = index[path_no % 2]
                        // To know if intersection is after the segment or before
                        segment.is_intersection_ahead = (segment_index == 0)
                        segment.intersection_coords = {
                            x: intersection.x,
                            y: intersection.y
                        }

                        return segment
                    } )
        
                    if( new_segments ) {
                        segmented_paths[path_index].push({
                            segment_no: intersection['segment' + path_no],
                            new_segments: new_segments
                        })
                    }
                }
            })
        }
    }


    // We have some Segments which overlap each other due to multiple intersections on same original segment
    // - is segment
    // * is intersection
    // ----*----- s1
    // --*------- s2
    // -------*-- s{n}
    // Final Segments should look like following segments
    // --*-*--*--
    segmented_paths = segmented_paths.map( (segmented_path, index) => {
        overlaping_segment_list = segmented_path.filter( segment => {
            return segmented_path.filter( segment_1 => segment.segment_no == segment_1.segment_no ).length > 1
        }).reduce( (prev, current) => {
            prev[current.segment_no] = [...(prev[current.segment_no] ? prev[current.segment_no] : []), current.new_segments]
            return prev
        }, {})

        let new_segmented_path = Object.keys(overlaping_segment_list).map( segment_no => {
            overlaping_segments = overlaping_segment_list[segment_no]
            let new_segments = []
            let P0 = getInitialPoint(segment_no, paths[index])

            if( P0 )
            {
                while( overlaping_segments.find( sub_segments => (sub_segments.length == 0) ) == undefined )
                {
                    initial_segments = overlaping_segments.map( sub_segments => sub_segments[0] )
                    smallest_segment = initial_segments.reduce( (prev, current) => {
                        if( getSegmentLength(P0, prev) > getSegmentLength(P0, current) )
                        {
                            return current
                        }

                        return prev
                    }, initial_segments[0])

                    new_segments.push(smallest_segment)

                    overlaping_segments = overlaping_segments.map( sub_segments => {
                        if( (sub_segments[0].x == smallest_segment.x) && (sub_segments[0].y == smallest_segment.y) )
                        {
                            sub_segments.shift()
                        }
                        else
                        {
                            path_1 = getPathString(P0, sub_segments[0])

                            // A line around the end point of the "smallest segment" to intersect other segments with
                            path_2 = `M${smallest_segment.x - 1} ${smallest_segment.y - 1}L${smallest_segment.x + 1} ${smallest_segment.y + 1}`

                            // Need to create a fallback intersecting line to intersect the segment if paht_2 lies on path_1 and hence is not able to intersect

                            intersections = intersect(path_1, path_2)

                            if( intersections.lenght > 0 )
                            {
                                [left, right] = splitSegment(sub_segments[0], P0, intersections[0], paths[index], 1)
                                sub_segments[0] = right
                            }
                        }

                        return sub_segments
                    } )

                    P0 = [smallest_segment.x, smallest_segment.y]
                }
            }

            return {
                segment_no: segment_no,
                new_segments: new_segments.map( (segment, s_index) => {
                    // Can Reduce the following code to one line
                    segment.is_intersection_ahead = true

                    if( s_index == (new_segments.length - 1) ) {
                        segment.is_intersection_ahead = false
                    }

                    return segment
                })
            }
        })

        segmented_path = segmented_path.filter( segment => !Object.keys(overlaping_segment_list).includes(segment.segment_no.toString()) )
        segmented_path = [...segmented_path, ...new_segmented_path]
        return segmented_path
    })
    
    // Replacing Segments on the intersection with the new splitted segments
    segmented_paths.forEach( (path_segments, index) => {
        path_segments = path_segments.sort( (a, b) => ( a.segment_no - b.segment_no ) )
        var new_path_segments = []
        var start = 0
        // var intersections = []
    
        path_segments.forEach( segment => {
            new_path_segments = new_path_segments.concat(paths[index].segments.slice(start, segment.segment_no))
            new_path_segments = new_path_segments.concat(segment.new_segments)

            // Need to re-consider the following logic

            start = parseInt(segment.segment_no) + segment.new_segments.length - 1
        })
    
        new_path_segments = new_path_segments.concat(paths[index].segments.slice(start))
    
        paths[index] = {
            path: encodeSVGPath(new_path_segments),
            segments: new_path_segments
        }
    })

    // Creating new paths based on Greiner–Hormann clipping algorithm
    var new_paths = []
    var visited_paths = []

    paths.forEach( (path, index) => {
        if( !visited_paths.includes(index) ) {
            // Storing the segments in an Object to remeber their original locations
            path_segments = paths.map( path => path.segments.map( segment => segment ) )
            new_path_segments = [...path.segments]
            path_segments[index][path.segments.length - 1].is_end_segment = true
            current_path = index
            fixed_path_length = 0
            visited_paths.push(index)

            for( var segment_index = 0; segment_index < new_path_segments.length; segment_index++ )
            {
                // Delelting the segments from temporarity list to avoid reusing them
                path_segments[current_path].shift()

                segment = new_path_segments[segment_index]
                if( segment.is_end_segment )
                {
                    new_path_segments = new_path_segments.slice(0, segment_index + 1);
                    break;
                }
                else if( segment.is_intersection_ahead === true )
                {
                    next_path = path_segments[segment.intersectee]

                    next_segment_index = next_path.findIndex( next_path_segment => (
                        next_path_segment.intersection_coords?.x == segment.intersection_coords.x &&
                        next_path_segment.intersection_coords?.y == segment.intersection_coords.y &&
                        next_path_segment.is_intersection_ahead === false
                    ))

                    if( next_segment_index > -1 )
                    {
                        next_segments = [...next_path.slice(next_segment_index), ...next_path.slice(0, next_segment_index)]

                        path_segments[segment.intersectee] = [...next_segments]

                        new_path_segments = [...new_path_segments.slice(0, segment_index + 1), ...next_segments]

                        visited_paths.push(segment.intersectee)

                        current_path = segment.intersectee
                    }
                }
                else if(
                    segment.type == SVGPathData.CLOSE_PATH ||
                    (
                        segment.type == SVGPathData.MOVE_TO &&
                        segment.x == new_path_segments[segment_index - 1]?.x &&
                        segment.y == new_path_segments[segment_index - 1]?.y
                    )
                )
                {
                    // Removing Closepaths and Move To's which get in between the new path
                    new_path_segments.splice(segment_index, 1)

                    segment_index--
                }
            }

            new_paths.push({
                segments: new_path_segments,
                path: encodeSVGPath(new_path_segments)
            })
        }
    })
    
    return new_paths.reduce( (prev, current) => ( prev + current.path ), "" )
}


// To Split Qubic Bezeir Curves at the specified t which is {0 -> 1}
function splitQCurve(points, t, left = [], right = []) {
    if( points.length == 1) {
        left.push(points[0])
        right.unshift(points[0])
    }
    else {
        newpoints = Array(points.length - 1)
        for(i = 0; i < newpoints.length; i++) {
            if( i == 0 ) {
                left.push(points[i])
            }
            if( i == (newpoints.length - 1) ) {
                right.unshift(points[i + 1])
            }
            newpoints[i] = cartAdd( cartMul(points[i], (1 - t)), cartMul(points[i + 1], t) )
        }
        [left, right] = splitQCurve(newpoints, t, left, right)
    }

    return [left, right]
}

// Cartesian Multipy
function cartMul(point, constant) {
    return [ (constant * point[0]), (constant * point[1]) ]
}

// Cartesian Add
function cartAdd(point1, point2) {
    return [ (point1[0] + point2[0]), (point1[1] + point2[1]) ]
}

// Splitting the segments at the point of intersection
function splitSegment(curr_segment, P0, intersection, path, path_no)
{
    new_segments = []

    switch( curr_segment.type ) {
        case SVGPathData.LINE_TO:
            new_segments = new SVGPathData(`
                                L${intersection.x} ${intersection.y}
                                L${curr_segment.x} ${curr_segment.y}`).commands
        break;
        case SVGPathData.QUAD_TO:
            P1 = [curr_segment.x1, curr_segment.y1]
            P2 = [curr_segment.x, curr_segment.y]
            var [left, right] = splitQCurve([P0, P1, P2], intersection['t' + path_no])

            segment_string = (left.length == 3) ? `Q${left[1][0]} ${left[1][1]} ${left[2][0]} ${left[2][1]}` : ""
            segment_string += (right.length == 3) ? `Q${right[1][0]} ${right[1][1]} ${right[2][0]} ${right[2][1]}` : ""

            new_segments = new SVGPathData(segment_string).commands
        break;
        case SVGPathData.CLOSE_PATH:
            new_segments = new SVGPathData(`
                                L${intersection.x} ${intersection.y}
                                L${path.segments[0].x} ${path.segments[0].y}`).commands
        break;
    }

    return new_segments
}

// Get Initial points for the givent segement_no in a path
function getInitialPoint(segment_no, path)
{
    prev_segment = (segment_no > 0) ? path.segments[segment_no - 1] : null
    if( prev_segment ) {
        switch( prev_segment.type ) {
            case SVGPathData.MOVE_TO:
            case SVGPathData.LINE_TO:
            case SVGPathData.QUAD_TO:
                P0 = [prev_segment.x, prev_segment.y]
            break;
            default:
                P0 = [0,0]
        }
    }

    return P0
}


function getSegmentLength(P0, segment)
{
    path_string = getPathString(P0, segment)
    properties = svg_properties.svgPathProperties(path_string)
    return properties.getTotalLength()
}

function getPathString(P0, segment)
{
    return `M${P0[0]} ${P0[1]}` + encodeSVGPath([segment])
}

function getTangent(P0, segment, lenght)
{
    path_string = getPathString(P0, segment)
    properties = svg_properties.svgPathProperties(path_string)
    return properties.getTangentAtLength(lenght)
}

exports.union = union