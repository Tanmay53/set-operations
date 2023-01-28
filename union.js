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
    
    // Making a Copy of the Array
    segmented_paths = paths.map( path => Array() )
    
    var index = [0, 0]
    
    // Finding Intersections and isolating them
    for(index[0] = 0; index[0] < paths.length - 1; index[0]++) {
        for(index[1] = (index[0] + 1); index[1] < paths.length; index[1]++) {
            intersect(paths[index[0]].path, paths[index[1]].path).map( intersection => {
                // Assuming no relativity in the data
    
                for(path_no = 1; path_no <= 2; path_no++)
                {
                    P0 = getInitialPoint(intersection['segment' + path_no], paths[index[path_no - 1]])
                    // P0 = P1 = P2 = [0, 0]
                    // prev_segment = (intersection['segment' + path_no] > 0) ? paths[index[path_no - 1]].segments[intersection['segment' + path_no] - 1] : null
                    // if( prev_segment ) {
                    //     switch( prev_segment.type ) {
                    //         case SVGPathData.MOVE_TO:
                    //         case SVGPathData.LINE_TO:
                    //         case SVGPathData.QUAD_TO:
                    //             P0 = [prev_segment.x, prev_segment.y]
                    //         break;
                    //     }
                    // }
        
                    curr_segment = paths[index[path_no - 1]].segments[intersection['segment' + path_no]]
        
                    new_segments = splitSegment(curr_segment, P0, intersection, paths[index[path_no - 1]], path_no)
        
                    // switch( curr_segment.type ) {
                    //     case SVGPathData.LINE_TO:
                    //         new_segments = new SVGPathData(`
                    //                             L${intersection.x} ${intersection.y}
                    //                             L${curr_segment.x} ${curr_segment.y}`).commands
                    //     break;
                    //     case SVGPathData.QUAD_TO:
                    //         P1 = [curr_segment.x1, curr_segment.y1]
                    //         P2 = [curr_segment.x, curr_segment.y]
                    //         var [left, right] = splitQCurve([P0, P1, P2], intersection['t' + path_no])
        
                    //         segment_string = (left.length == 3) ? `Q${left[1][0]} ${left[1][1]} ${left[2][0]} ${left[2][1]}` : ""
                    //         segment_string += (right.length == 3) ? `Q${right[1][0]} ${right[1][1]} ${right[2][0]} ${right[2][1]}` : ""
        
                    //         new_segments = new SVGPathData(segment_string).commands
                    //     break;
                    //     case SVGPathData.CLOSE_PATH:
                    //         new_segments = new SVGPathData(`
                    //                             L${intersection.x} ${intersection.y}
                    //                             L${paths[index[path_no - 1]].segments[0].x} ${paths[index[path_no - 1]].segments[0].y}`).commands
                    //     break;
                    // }

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
                        // console.log( index[path_no - 1], segmented_paths[index[path_no - 1]])
                        segmented_paths[index[path_no - 1]].push({
                            segment_no: intersection['segment' + path_no],
                            new_segments: new_segments,
                            // Assuming that there are 2 new segments
                            // intersectee: (path_no == 1) ? index[1] : index[0],
                            // intersection_coord: {
                            //     x: intersection.x,
                            //     y: intersection.y
                            // }
                        })
                        // segmented_paths[index[path_no - 1]].segments.splice(intersection['segment' + path_no], 1, ...new_segments)
                    }
                }
    
                // return intersection
                // Create Two segments at the intersection
            })
        }
    }

    segmented_paths = segmented_paths.map( (segmented_path, index) => {
        overlaping_segment_list = segmented_path.filter( segment => {
            return segmented_path.filter( segment_1 => segment.segment_no == segment_1.segment_no ).length > 1
        }).reduce( (prev, current) => {
            prev[current.segment_no] = [...(prev[current.segment_no] ? prev[current.segment_no] : []), current.new_segments]
            return prev
        }, {})

        // We have some Segments which overlap each other due to multiple intersections on same original segment
        // - is segment
        // * is intersection
        // ----*----- s1
        // --*------- s2
        // -------*-- s{n}
        // Final Segments should look like following segments
        // --*-*--*--

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
                            // A line around the end point of smallest segment to intersect other segments
                            path_2 = `M${smallest_segment.x - 1} ${smallest_segment.y - 1}L${smallest_segment.x + 1} ${smallest_segment.y + 1}`
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
    
    // Creating new Segments around the intersections
    segmented_paths.forEach( (path_segments, index) => {
        path_segments = path_segments.sort( (a, b) => ( a.segment_no - b.segment_no ) )
        var new_path_segments = []
        var start = 0
        // var intersections = []
    
        path_segments.forEach( segment => {
            new_path_segments = new_path_segments.concat(paths[index].segments.slice(start, segment.segment_no))
            new_path_segments = new_path_segments.concat(segment.new_segments)

            // total_segments = new_path_segments.length
            // intersections.push({
            //     left: total_segments - 2,
            //     right: total_segments - 1,
            //     intersectee: segment.intersectee,
            //     coord: segment.intersection_coord
            // })

            start = parseInt(segment.segment_no) + segment.new_segments.length - 1
        })
    
        new_path_segments = new_path_segments.concat(paths[index].segments.slice(start))

        // new_path_segments.reduce()
    
        paths[index] = {
            path: encodeSVGPath(new_path_segments),
            segments: new_path_segments,
            // intersections: intersections
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
                // delete path_segments[current_path][segment_index - fixed_path_length]
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
                        // console.log(next_segments.length, next_segment_index, current_path, segment.intersectee, segment_index)
                        new_path_segments = [...new_path_segments.slice(0, segment_index + 1), ...next_segments]
                        // fixed_path_length = segment_index + 1
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
    
    // function generateNewPathSegments(initial_path, start_path, start_segment = 0) {
    //     var path = paths[start_path];
    //     var available_intersections = path.intersections.filter( (intersection, index) => !visited_path_intersections[start_path].includes(index) )

    //     var regional_segments = []

    //     if( available_intersections.length > 0 ) {
    //         // check if available intersection lenght > 0
    //         var next_intersection = available_intersections.reduce( (prev, current, index) => {
    //             if( current.left >= start_segment && prev.left > current.left ) {
    //                 return current
    //             }

    //             return prev
    //         }, available_intersections[0])

    //         if( next_intersection.left < start_segment ) {
    //             if( initial_path == start_path ) {
    //                 regional_segments = path.segments.slice(start_segment)
    //                 return regional_segments;
    //             }
    //             else {
    //                 // Assuming that last element in the path in ClosePath Z
    //                 regional_segments = path.segments.slice(start_segment, path.segments.length - 1)
    //                 console.log(path.segments[0])
    //                 regional_segments.concat(new SVGPathData(`L${path.segments[0].x} ${path.segments[0].y}`).commands)
    //                 regional_segments.concat(path.segments.slice(1, next_intersection.left + 1))
    //             }
    //         }
    //         else {
    //             regional_segments = path.segments.slice(start_segment, next_intersection.left + 1)
    //         }

    //         var {right: next_start_segment} =  paths[next_intersection.intersectee].intersections.find( intersection_a => ((next_intersection.coord.x == intersection_a.coord.x) && (next_intersection.coord.y == intersection_a.coord.y)) )

    //         return regional_segments.concat( generateNewPathSegments(initial_path, next_intersection.intersectee, next_start_segment))
    //     }

    //     return regional_segments;

    // }
    // Removing the Segments inside the Union of the Paths
    // paths = paths.map( (path, index) => {
    //     if( segmented_paths[index].length == 0 ) {
    //         return path
    //     }
    
    //     var segments = path.segments.map( (segment, s_index) => {
    //         if( s_index > 0 ) {
    //             var P0 = P1 = P2 = [0, 0]
    //             var midpoint = null
    //             prev_segment = path.segments[s_index - 1]
    //             if( prev_segment ) {
    //                 switch( prev_segment.type ) {
    //                     case SVGPathData.MOVE_TO:
    //                     case SVGPathData.LINE_TO:
    //                     case SVGPathData.QUAD_TO:
    //                         P0 = [prev_segment.x, prev_segment.y]
    //                     break;
    //                 }
    //             }
    
    //             switch(segment.type) {
    //                 case SVGPathData.LINE_TO:
    //                     P2 = [segment.x, segment.y]
    //                     midpoint = [
    //                         (P0[0] + segment.x) / 2,
    //                         (P0[1] + segment.y) / 2
    //                     ]
    //                 break;
    //                 case SVGPathData.QUAD_TO:
    //                     P2 = [segment.x, segment.y]
    //                     var [{2: midpoint}, right] = splitQCurve([P0, [segment.x1, segment.y1], [segment.x, segment.y]], 0.5)
    //                 break;
    //                 case SVGPathData.CLOSE_PATH:
    //                     P2 = [path.segments[0].x, path.segments[0].y]
    //                     midpoint = [
    //                         (P0[0] + P2[0]) / 2,
    //                         (P0[1] + P2[1]) / 2
    //                     ]
    //             }
    
    //             if( midpoint ) {
    //                 other_paths = paths.reduce( (prev, current, p_index) => prev + (( p_index != index ) ? current.path : ""), "" )
    //                 y_perpendicular_path = `M${midpoint[0]} ${midpoint[1]}L0 ${midpoint[1]}`
    //                 x_perpendicular_path = `M${midpoint[0]} ${midpoint[1]}L${midpoint[0]} 0`
    //                 y_intersection_count = intersect(other_paths, y_perpendicular_path, true)
    //                 x_intersection_count = intersect(other_paths, x_perpendicular_path, true)
    //                 if( (y_intersection_count % 2 == 1) && (x_intersection_count % 2 == 1) ) {
    //                     return new SVGPathData(`M${P2[0]} ${P2[1]}`).commands[0]
    //                     // console.log(new SVGPathData(`M${P2[0]} ${P2[1]}`).commands[0])
    //                     // return
    //                 }
    //             }
    
    //             if( (s_index == (path.segments.length - 1)) && (segment.type == SVGPathData.CLOSE_PATH) ) {
    //                 return new SVGPathData(`L${path.segments[0].x} ${path.segments[0].y}`).commands[0]
    //             }
    //         }
    
    //         return segment
    //     })
    
    //     // segments = segments.filter( segment => segment )
    
    //     return {
    //         path: encodeSVGPath(segments),
    //         segments: segments
    //     }
    // })
    
    return new_paths.reduce( (prev, current) => ( prev + current.path ), "" )
}



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