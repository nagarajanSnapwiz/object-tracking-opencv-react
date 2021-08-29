
import { css,keyframes } from '@emotion/react'
/** @jsxImportSource @emotion/react */
import React, { useState, useRef, useEffect } from 'react';
import { useOpenCv } from 'opencv-react';
import { Rnd } from 'react-rnd';

const URL = window.URL || window.webkitURL;

const redblueGlow = keyframes`
    from, to {
        border-color: rgb(255,0,0);
    }
    50% {
        border-color: rgb(0,0,255);
    }
`;

function DrawingArea({height,onDoubleClick,marker,setMarker}){
    console.log('marker',marker);
    return (<div 
            css={css`
                position :absolute ;
                left: 0;
                top:0;
                width: 320px;
                height: ${height}px;`}
                onDoubleClick={onDoubleClick}
            >
            {
            marker ?
            <Rnd
                css={css`
                    border-width: 2px;
                    border-style: dashed;
                    animation: ${redblueGlow} 1s ease infinite;
                    box-sizing: border-box;
                `}
                bounds="parent"
                size={{width: marker.width,height:marker.height}}
                position={{x:marker.x,y:marker.y}}
                 onDragStop={(e, d) => { 
                    setMarker(m => {
                        const newM = {...m,x:d.x,y:d.y};
                        console.log('setMarker1',newM)
                       return newM;
                    })
                  }}
                 onResizeStop={(e, direction, ref, delta, position) => {
                    setMarker(m => {
                        console.log('setMarker2',position)
                        const res = ({...m,width:parseFloat(ref.style.width),height:parseFloat(ref.style.height), x:position.x,y:position.y})
                        return res;
                    });
                  }}
             />:
            null}  
    </div>)
}

function processVideo({streaming,frame,dst,hsvVec,roiHist,hsv,cap,trackWindow,termCrit,canvasOutput,cv}) {
    try {
        if (!streaming?.current) {
            // clean and stop.
            frame.delete(); dst.delete(); hsvVec.delete(); roiHist.delete(); hsv.delete();
            return;
        }

        // start processing.
        cap.read(frame);
        cv.cvtColor(frame, hsv, cv.COLOR_RGBA2RGB);
        cv.cvtColor(hsv, hsv, cv.COLOR_RGB2HSV);
        cv.calcBackProject(hsvVec, [0], roiHist, dst, [0, 180], 1);

        // Apply meanshift to get the new location
        // and it also returns number of iterations meanShift took to converge,
        // which is useless in this demo.
        [, trackWindow] = cv.meanShift(dst, trackWindow, termCrit);

        // Draw it on image
        let [x, y, w, h] = [trackWindow.x, trackWindow.y, trackWindow.width, trackWindow.height];
        cv.rectangle(frame, new cv.Point(x, y), new cv.Point(x+w, y+h), [255, 0, 0, 255], 2);
        cv.imshow(canvasOutput, frame);
        requestAnimationFrame(()=>{
            processVideo({streaming,frame,dst,hsvVec,roiHist,hsv,cap,trackWindow,termCrit,canvasOutput,cv})
        })
    } catch (err) {
        console.warn('error',err);
    }
};

export default function Tracker() {
    const fileUrlRef = useRef(null);
    const [videoLoaded, setVideoLoaded] = useState(false);
    const [playing, setPlaying] = useState(false);
    const videRef = useRef();
    const playingRef = useRef(false);
    const { loaded: openCvLoaded, cv } = useOpenCv();
    const canvasRef = useRef();
    const [videoHeight,setVideoHeight] = useState(0);
    console.log('videoHeight',videoHeight);
    useEffect(() => {
        playingRef.current = playing;
    }, [playing])
    const [marker,setMarker] = useState(null);

    useEffect(() => {

        if (playing && fileUrlRef.current && openCvLoaded) {
            const video = videRef.current;
            let cap = new cv.VideoCapture(video);
            // take first frame of the video
            let frame = new cv.Mat(video.height, video.width, cv.CV_8UC4);
            cap.read(frame);
            // hardcode the initial location of window
            let trackWindow = new cv.Rect(111, 76, 10, 50);
            if(marker){
                trackWindow = new cv.Rect(marker.x, marker.y, marker.width, marker.height);
            }
            
            // set up the ROI for tracking
            let roi = frame.roi(trackWindow);
            let hsvRoi = new cv.Mat();
            cv.cvtColor(roi, hsvRoi, cv.COLOR_RGBA2RGB);
            cv.cvtColor(hsvRoi, hsvRoi, cv.COLOR_RGB2HSV);
            let mask = new cv.Mat();
            let lowScalar = new cv.Scalar(30, 30, 0);
            let highScalar = new cv.Scalar(180, 180, 180);
            let low = new cv.Mat(hsvRoi.rows, hsvRoi.cols, hsvRoi.type(), lowScalar);
            let high = new cv.Mat(hsvRoi.rows, hsvRoi.cols, hsvRoi.type(), highScalar);
            cv.inRange(hsvRoi, low, high, mask);
            let roiHist = new cv.Mat();
            let hsvRoiVec = new cv.MatVector();
            hsvRoiVec.push_back(hsvRoi);
            cv.calcHist(hsvRoiVec, [0], mask, roiHist, [180], [0, 180]);
            cv.normalize(roiHist, roiHist, 0, 255, cv.NORM_MINMAX);

            // delete useless mats.
            roi.delete(); hsvRoi.delete(); mask.delete(); low.delete(); high.delete(); hsvRoiVec.delete();

            // Setup the termination criteria, either 10 iteration or move by atleast 1 pt
            let termCrit = new cv.TermCriteria(cv.TERM_CRITERIA_EPS | cv.TERM_CRITERIA_COUNT, 10, 1);

            let hsv = new cv.Mat(video.height, video.width, cv.CV_8UC3);
            let dst = new cv.Mat();
            let hsvVec = new cv.MatVector();
            hsvVec.push_back(hsv);
            requestAnimationFrame(()=>{
                processVideo({streaming:playingRef,frame,dst,hsvVec,roiHist,hsv,cap,trackWindow,termCrit,canvasOutput:canvasRef.current,cv})
            })
        }
    }, [playing, openCvLoaded,cv])

    useEffect(() => {
        return () => {
            if (fileUrlRef.current) {
                URL.revokeObjectURL(fileUrlRef.current);
            }
        }
    }, [])

    if (!openCvLoaded) {
        return <h1>Loading...</h1>;
    }

    return (<div className="container">
        <h1>Tracker</h1>
        <button disabled={!videoLoaded} onClick={() => {
            videRef?.current?.play();
            setPlaying(true)
        }}>Play</button>
        <input type="file" accept="video/*" onChange={(e) => {
            const file = e.target.files[0];
            const type = file.type;
            /**
             * @type {HTMLMediaElement}
             */
            const video = videRef.current;
            if (!video.canPlayType(type)) {
                console.warn('unsupported file type');
                return;
            }
            video.pause();
            if (fileUrlRef.current) {
                URL.revokeObjectURL(fileUrlRef.current);
            }
            const url = URL.createObjectURL(file);
            fileUrlRef.current = url;
            video.src = url;
            setVideoLoaded(true);
        }} />
        <div css={css`
            display: flex;
            flex-flow: row nowrap;
            justify-content: flex-start;
            align-content: flex-start;
            align-items: flex-start;
            position: relative;
        `}>
            <video 
            width={320}
             {...(videoHeight?{height:videoHeight}:{})}  
            onEnded={() => {
                setPlaying(false);
                videRef.current.currentTime=0;
            }}
            onLoadedMetadata={(e)=>{
                const video = e.target;
                const heightOfVideo = video.videoHeight*(video.width/video.videoWidth)
                setVideoHeight(heightOfVideo);
            }}
            css={css`
                flex:0 1 auto;
                align-self: auto;
            `}
            ref={videRef}
            style={{ display: videoLoaded ? `block` : `none` }} 
            />
            <DrawingArea {...(videoHeight?{height:videoHeight}:{})}  onDoubleClick={(e)=>{
                let bounds = e.target.getBoundingClientRect();
                let x = e.clientX - bounds.left;
                let y = e.clientY - bounds.top;
                setMarker({x:x-15,y:y-15,width:30,height:30});
            }} marker={marker} setMarker={setMarker} />
            <canvas
                ref={canvasRef}
                width={320} 
                css={css`
                    flex:0 1 auto;
                    align-self: auto;
                `}
                {...(videoHeight?{height:videoHeight}:{})}
                  />
        </div>
    </div>)
}