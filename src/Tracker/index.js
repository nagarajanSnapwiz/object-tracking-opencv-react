import { css, jsx } from '@emotion/react'

import React, { useState, useRef, useEffect } from 'react';
import { useOpenCv } from 'opencv-react';

const URL = window.URL || window.webkitURL;

function printError(cv){
    let err='';
    if (typeof err === 'undefined') {
        err = '';
    } else if (typeof err === 'number') {
        if (!isNaN(err)) {
            if (typeof cv !== 'undefined') {
                err = 'Exception: ' + cv.exceptionFromPtr(err).msg;
            }
        }
    } else if (typeof err === 'string') {
        let ptr = Number(err.split(' ')[0]);
        if (!isNaN(ptr)) {
            if (typeof cv !== 'undefined') {
                err = 'Exception: ' + cv.exceptionFromPtr(ptr).msg;
            }
        }
    } else if (err instanceof Error) {
        err = err.stack.replace(/\n/g, '<br>');
    }
    console.log('error',err);
}

window.printError = printError;


function DrawingArea({}){
    return (<div className={css`
            position :absolute ;
            left: 0;
            top:0;
            width: 320px;
            background-color: rgba(0,0,0,0.3);
    `}>
        <h1>test</h1>
    </div>)
}

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

    function processVideo({streaming,frame,dst,hsvVec,roiHist,hsv,cap,trackWindow,termCrit,canvasOutput}) {
        try {
            if (!streaming?.current) {
                // clean and stop.
                frame.delete(); dst.delete(); hsvVec.delete(); roiHist.delete(); hsv.delete();
                return;
            }
            let begin = Date.now();
    
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
                processVideo({streaming,frame,dst,hsvVec,roiHist,hsv,cap,trackWindow,termCrit,canvasOutput})
            })
        } catch (err) {
            console.warn('error',err);
        }
    };
    

    useEffect(() => {

        if (playing && fileUrlRef.current && openCvLoaded) {
            const video = videRef.current;
            let cap = new cv.VideoCapture(video);
            // take first frame of the video
            let frame = new cv.Mat(video.height, video.width, cv.CV_8UC4);
            cap.read(frame);
            // hardcode the initial location of window
            let trackWindow = new cv.Rect(111, 76, 10, 50);

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
                processVideo({streaming:playingRef,frame,dst,hsvVec,roiHist,hsv,cap,trackWindow,termCrit,canvasOutput:canvasRef.current})
            })
        }
    }, [playing, openCvLoaded, fileUrlRef.current])

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
            setTimeout(()=>{
                const heightOfVideo = video.videoHeight*(video.width/video.videoWidth)
                console.log({vvw: video.width,vvww:video.videoWidth, vvh:video.videoHeight});
                setVideoHeight(heightOfVideo);
            },1000)
            //video.play();
        }} />
        <div className={css`
            width: 600px;
            height: 600px;
            position: relative;
        `}>
            <video 
            width={320}
             {...(videoHeight?{height:videoHeight}:{})}  
            onEnded={() => {
                setPlaying(false);
                videRef.current.currentTime=0;
            }} 
            ref={videRef}
            onClick={(e)=>{
                let bounds = e.target.getBoundingClientRect();
                let x = e.clientX - bounds.left;
                let y = e.clientY - bounds.top;
            
                console.log('xxxff',x, y);
            }}
            style={{ display: videoLoaded ? `block` : `none` }} 
            />
            <DrawingArea />
        </div>
        <canvas ref={canvasRef} width={320} {...(videoHeight?{height:videoHeight}:{})}  />
    </div>)
}