(function(){
    const SEC24H = 24*60*60.0;
    const DEG2RAD = Math.PI / 180.0;
    const SEC2RAD = 2*Math.PI / SEC24H;

    function clamp(x, lower, upper){
        return x < lower ? lower : x > upper ? upper : x;
    }

    //
    // Array Layout:
    // [0 4 8  12      [0
    //  1 5 9  13   *   1
    //  2 6 10 14       2
    //  3 7 11 15]      3]
    //
    const M4 = {
        identity: function(){
            return [1, 0, 0, 0,
                    0, 1, 0, 0,
                    0, 0, 1, 0,
                    0, 0, 0, 1];
        },
        rotZ: function(rad){
            return [Math.cos(rad), Math.sin(rad), 0, 0,
                    -Math.sin(rad), Math.cos(rad), 0, 0,
                    0, 0, 1, 0,
                    0, 0, 0, 1];
        },
        rotY: function(rad){
            return [Math.cos(rad), 0, -Math.sin(rad), 0,
                    0, 1, 0, 0,
                    Math.sin(rad), 0, Math.cos(rad), 0,
                    0, 0, 0, 1];
        },
        rotX: function(rad){
            return [1, 0, 0, 0,
                    0, Math.cos(rad), Math.sin(rad), 0,
                    0, -Math.sin(rad),Math.cos(rad), 0,
                    0, 0, 0, 1];
        },
        perspective: function(fovYDeg, screenW, screenH, nearZ, farZ){
            const fovYRad = fovYDeg * DEG2RAD;
            const aspectRatio = screenH / screenW;

            const h = 1.0 / Math.tan(fovYRad / 2.0);
            const w = h * aspectRatio;
            const zNearFar = nearZ - farZ;
            return [
                w, 0, 0, 0,
                0, h, 0, 0,
                0, 0, (farZ+nearZ)/zNearFar, -1,
                0, 0, 2*nearZ*farZ/zNearFar, 0];
        },
        translate: function(dx, dy, dz){
            return [
                1, 0, 0, 0,
                0, 1, 0, 0,
                0, 0, 1, 0,
                dx, dy, dz, 1];
        },
        scale: function(sx, sy, sz){
            if(sy === undefined){sy = sx;}
            if(sz === undefined){sz = sx;}
            return [
                sx, 0, 0, 0,
                0, sy, 0, 0,
                0, 0, sz, 0,
                0, 0, 0, 1];
        },
        mulM4: function(l, r){
            return [
                l[0]*r[0]+l[4]*r[1]+l[8]*r[2]+l[12]*r[3],
                l[1]*r[0]+l[5]*r[1]+l[9]*r[2]+l[13]*r[3],
                l[2]*r[0]+l[6]*r[1]+l[10]*r[2]+l[14]*r[3],
                l[3]*r[0]+l[7]*r[1]+l[11]*r[2]+l[15]*r[3],

                l[0]*r[4]+l[4]*r[5]+l[8]*r[6]+l[12]*r[7],
                l[1]*r[4]+l[5]*r[5]+l[9]*r[6]+l[13]*r[7],
                l[2]*r[4]+l[6]*r[5]+l[10]*r[6]+l[14]*r[7],
                l[3]*r[4]+l[7]*r[5]+l[11]*r[6]+l[15]*r[7],

                l[0]*r[8]+l[4]*r[9]+l[8]*r[10]+l[12]*r[11],
                l[1]*r[8]+l[5]*r[9]+l[9]*r[10]+l[13]*r[11],
                l[2]*r[8]+l[6]*r[9]+l[10]*r[10]+l[14]*r[11],
                l[3]*r[8]+l[7]*r[9]+l[11]*r[10]+l[15]*r[11],

                l[0]*r[12]+l[4]*r[13]+l[8]*r[14]+l[12]*r[15],
                l[1]*r[12]+l[5]*r[13]+l[9]*r[14]+l[13]*r[15],
                l[2]*r[12]+l[6]*r[13]+l[10]*r[14]+l[14]*r[15],
                l[3]*r[12]+l[7]*r[13]+l[11]*r[14]+l[15]*r[15]];
        },
        mulV4: function(l, r){
            return [
                l[0] * r[0] + l[4] * r[1] + l[8] * r[2] + l[12] * r[3],
                l[1] * r[0] + l[5] * r[1] + l[9] * r[2] + l[13] * r[3],
                l[2] * r[0] + l[6] * r[1] + l[10] * r[2] + l[14] * r[3],
                l[3] * r[0] + l[7] * r[1] + l[11] * r[2] + l[15] * r[3]];
        }
    };

    function dirRADec(ra, dec){
        // x+:6h, y+: North, z+:0h(Vernal Equinox)
        return [
            Math.cos(dec) * Math.sin(ra),
            Math.sin(dec),
            Math.cos(dec) * Math.cos(ra),
            1];
    }
    function dirAzEl(az, el){
        // x+:East, y+:Zenith, z+:South
        return [
            Math.cos(el)*Math.sin(az),
            Math.sin(el),
            Math.cos(el)*Math.cos(az),
            1];
    }

    function convertRADecToAzEl(ra, dec, matEquToHor)
    {
        const dirEquatorial = dirRADec(ra, dec);
        const dirHorizontal = M4.mulV4(matEquToHor, dirEquatorial);
        const x = dirHorizontal[0];//for East
        const y = dirHorizontal[1];//for Zenith
        const z = dirHorizontal[2];//for South
        const az = Math.atan2(-x, z);
        const el = Math.asin(y);

        return {
            az: az * 180 / Math.PI,
            el: el * 180 / Math.PI
        };
    }

    //
    // Time Conversion
    //
    function convertUnixSecondsToGreenwichMeanSiderealTime(unixSeconds){
        ///@todo validation
        ///@todo add leap seconds
        const jd00 = unixSeconds / SEC24H + (2440587.5 - 2451545.0); //2440587.5=Unix Epoch(in JD), 2451545.0=J2000.0(in JD)
        const t = jd00 / 36525.0; //36525.0=Days per Julian century
        const f = SEC24H * (jd00 % 1.0);
        const A = 24110.54841  -  SEC24H / 2.0;
        const B = 8640184.812866;
        const C = 0.093104;
        const D =  -6.2e-6;
        const gmst = ((A + (B + (C + D * t) * t) * t) + f) * SEC2RAD; //[rad]
        const gmstNormalized = gmst % (2*Math.PI);
        return gmstNormalized < 0 ? (2*Math.PI) + gmstNormalized : gmstNormalized;
    }

    //
    // StarChart
    //

    function StarChart(stars, options){
        // astronomical latitude and longitude
        const lat = typeof(options.lat)=="number" ? options.lat : 35.681236; //Tokyo Station(geodetic)
        const lng = typeof(options.lng)=="number" ? options.lng : 139.767125; //Tokyo Station(geodetic)

        var matEquToHor; //x+:6h, y+:North, z+:0h to x+:East, y+:Zenith, z+:South
        function updateEquToHorMatrix()
        {
            const st = convertUnixSecondsToGreenwichMeanSiderealTime(Math.floor(Date.now() / 1000)) + lng*DEG2RAD;
            matEquToHor = M4.mulM4(M4.rotX((lat-90) * DEG2RAD), M4.rotY(-st));
        }
        updateEquToHorMatrix();

        //
        // View
        //

        let screenWidth;
        let screenHeight;
        let fovY = typeof(options.fov)=="number" ? options.fov : 50; //[deg]
        const useStereographicProjection = true;
        var matProj;
        function updateProjectionMatrix()
        {
            matProj = M4.perspective(fovY, screenWidth, screenHeight, 0.0125, 3.0);
            if(useStereographicProjection){
                matProj = M4.mulM4(matProj, M4.translate(0, 0, -1)); //Stereographic Projection
            }
            updateViewMatrix();
        }
        function setFOV(fov)
        {
            fov = clamp(fov, 30, 120);
            if(fov != fovY){
                fovY = fov;
                updateProjectionMatrix();
                drawFrame();
            }
        }
        function setFOVDelta(delta)
        {
            setFOV(fovY + delta);
        }

        if(typeof(options.ra)=="number" && typeof(options.dec)=="number"){
            const horDir = convertRADecToAzEl(options.ra*DEG2RAD, options.dec*DEG2RAD, matEquToHor);
            options.az = horDir.az;
            options.el = horDir.el;
        }
        let viewAz = typeof(options.az)=="number" ? options.az : 0;
        let viewEl = typeof(options.el)=="number" ? options.el : 0;
        let matView;
        function updateViewMatrix(){
            matView = M4.mulM4(M4.rotX(-viewEl * DEG2RAD), M4.rotY((180+viewAz) * DEG2RAD));
        }
        function setViewDir(az, el){
            viewAz = az;
            viewEl = clamp(el, -120, 120); //more than 90 degrees to see behind
            updateViewMatrix();
            drawFrame();
        }

        let cv;
        let renderer;
        function setupCanvas()
        {
            cv = document.createElement("canvas");
            cv.style = "position: absolute; left:0; top:0;";
            document.body.appendChild(cv);

            window.addEventListener("resize", onResizeWindow);
            function onResizeWindow(){
                cv.width = screenWidth = window.innerWidth;
                cv.height = screenHeight = window.innerHeight;
                updateProjectionMatrix();
                if(renderer){
                    renderer.onResize();
                    drawFrame();
                }
            }
            onResizeWindow();

            if(options.renderer == "2d"){
                renderer = new Canvas2DRenderer(cv, stars);
            }
            else{
                renderer = new WebGLRenderer(cv, stars);
            }
            drawFrame();
        }

        function drawFrame()
        {
            if(renderer){
                renderer.drawFrame(matEquToHor, matView, matProj);
            }
        }


        // setup
        updateEquToHorMatrix();
        setupCanvas();

        // public
        this.getCV = function(){return cv;};
        this.getFOV = function(){return fovY;};
        this.setFOV = setFOV;
        this.zoom = setFOVDelta;
        this.getViewAz = function(){return viewAz;};
        this.getViewEl = function(){return viewEl;};
        this.setViewDir = setViewDir;
    }//StarChart

    //
    // Renderer
    //

    const COLOR_GRID = [0, 0.5, 1, 0.25];
    const COLOR_HORIZON = [0.5, 1, 0, 0.4];
    const COLOR_NORTH = [1, 0, 0, 0.4];
    const COLOR_SOUTH = [1, 1, 1, 0.25];

    function WebGLRenderer(cv, stars)
    {
        const gl = cv.getContext("webgl");

        this.drawFrame = drawFrame;
        function drawFrame(matEquToHor, matView, matProj)
        {
            clear();
            drawGrid(matEquToHor, matView, matProj);
            drawStars(matEquToHor, matView, matProj);
        }

        function clear()
        {
            gl.clearColor(0, 0, 0, 1);
            gl.clear(gl.COLOR_BUFFER_BIT);
        }

        const starRenderer = new StarRenderer();
        function StarRenderer()
        {
            const numStars = Math.floor(stars.length / 4);

            const BUFFER_STRIDE = 2+3+1;
            const bufferLayout = {
                numVertices: numStars,
                attrStride: BUFFER_STRIDE * Float32Array.BYTES_PER_ELEMENT,
                attr: {
                    position: {offset:0, size:2},
                    color: {offset:2 * Float32Array.BYTES_PER_ELEMENT, size:3},
                    radius: {offset:5 * Float32Array.BYTES_PER_ELEMENT, size:1}
                }
            };
            const bufferData = new Float32Array(numStars*BUFFER_STRIDE);
            for(let i = 0; i < numStars; ++i){
                const ra = stars[i*4+0]; //[rad]
                const dec = stars[i*4+1]; //[rad]
                const vmag = stars[i*4+2]; //@todo hpmag to vmag ?
                const bv = stars[i*4+3];
                const appearance = calculateAppearanceOfStar(vmag, bv);

                bufferData[i*BUFFER_STRIDE+0] = ra;
                bufferData[i*BUFFER_STRIDE+1] = dec;
                bufferData[i*BUFFER_STRIDE+2] = appearance.red;
                bufferData[i*BUFFER_STRIDE+3] = appearance.green;
                bufferData[i*BUFFER_STRIDE+4] = appearance.blue;
                bufferData[i*BUFFER_STRIDE+5] = appearance.radius*2 + 1.0;
            }

            // Vertex Buffer
            const buffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            gl.bufferData(gl.ARRAY_BUFFER, bufferData, gl.STATIC_DRAW);

            // Shader Program
            var shader = createShaderProgram(
                "attribute vec2 a_position; attribute vec3 a_color; attribute float a_radius; uniform mat4 u_matrix; varying vec3 v_color; void main(void){float cd=cos(a_position.y), sd=sin(a_position.y), cr=cos(a_position.x), sr=sin(a_position.x); gl_Position = u_matrix * vec4(cd*sr, sd, cd*cr, 1.0); v_color = a_color; gl_PointSize = a_radius;}",
                "precision mediump float; varying vec3 v_color; void main(void){float d = sqrt(1.0 - 2.0*length(gl_PointCoord - vec2(0.5))); gl_FragColor = d * vec4(v_color, 1.0);}");
            const shaderLocations = {
                attr: {
                    position: gl.getAttribLocation(shader, "a_position"),
                    color: gl.getAttribLocation(shader, "a_color"),
                    radius: gl.getAttribLocation(shader, "a_radius"),
                },
                uniform: {
                    matrix: gl.getUniformLocation(shader, "u_matrix")
                }
            };

            function draw(matEquToProj){
                gl.enable(gl.BLEND);
                gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE, gl.ONE, gl.ONE);//Additive Blend

                gl.useProgram(shader);
                gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
                gl.vertexAttribPointer(
                    shaderLocations.attr.position,
                    bufferLayout.attr.position.size,
                    gl.FLOAT, false, bufferLayout.attrStride,
                    bufferLayout.attr.position.offset);
                gl.vertexAttribPointer(
                    shaderLocations.attr.color,
                    bufferLayout.attr.color.size,
                    gl.FLOAT, false, bufferLayout.attrStride,
                    bufferLayout.attr.color.offset);
                gl.vertexAttribPointer(
                    shaderLocations.attr.radius,
                    bufferLayout.attr.radius.size,
                    gl.FLOAT, false, bufferLayout.attrStride,
                    bufferLayout.attr.radius.offset);
                gl.enableVertexAttribArray(shaderLocations.attr.position);
                gl.enableVertexAttribArray(shaderLocations.attr.color);
                gl.enableVertexAttribArray(shaderLocations.attr.radius);

                gl.uniformMatrix4fv(shaderLocations.uniform.matrix, false, new Float32Array(matEquToProj));
                gl.drawArrays(gl.POINTS, 0, bufferLayout.numVertices);

                gl.disableVertexAttribArray(shaderLocations.attr.position);
                gl.disableVertexAttribArray(shaderLocations.attr.color);
                gl.disableVertexAttribArray(shaderLocations.attr.radius);
                gl.disable(gl.BLEND);
            }
            this.draw = draw;
        }
        function drawStars(matEquToHor, matView, matProj){
            const matEquToProj = M4.mulM4(matProj, M4.mulM4(matView, matEquToHor));
            starRenderer.draw(matEquToProj);
        }

        function ArcRenderer(){
            const step = 5;
            const numVertices = 360 / step + 1;
            const bufferLayout = {
                numVertices: numVertices,
                attrStride: 2 * Float32Array.BYTES_PER_ELEMENT,
                attr: {
                    position: {
                        offset: 0,
                        size: 2,
                    },
                }
            };
            const bufferData = new Float32Array(numVertices * 2);
            for(let i = 0; i < numVertices; ++i){
                const rad = i*step*DEG2RAD;
                bufferData[i*2+0] = Math.cos(rad);
                bufferData[i*2+1] = Math.sin(rad);
            }
            const buffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            gl.bufferData(gl.ARRAY_BUFFER, bufferData, gl.STATIC_DRAW);

            var shader = createShaderProgram(
                "attribute vec2 a_position; uniform mat4 u_matrix;"+
                    "void main(void){gl_Position = u_matrix * vec4(a_position, 0.0, 1.0);}",
                "precision mediump float; uniform vec4 u_color; void main(void){gl_FragColor = u_color;}");
            const shaderLocations = {
                attr: {
                    position: gl.getAttribLocation(shader, "a_position")
                },
                uniform: {
                    matrix: gl.getUniformLocation(shader, "u_matrix"),
                    color: gl.getUniformLocation(shader, "u_color")
                },
            };

            function draw(mat, color, angleBegin, angleEnd){
                if(angleBegin === undefined){ angleBegin = 0;}
                if(angleEnd === undefined){ angleEnd = 360;}
                angleBegin = clamp(Math.floor(angleBegin / step), 0, numVertices);
                angleEnd = clamp(Math.floor(angleEnd / step) + 1, 0, numVertices);

                gl.useProgram(shader);
                gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
                gl.vertexAttribPointer(
                    shaderLocations.attr.position,
                    bufferLayout.attr.position.size,
                    gl.FLOAT, false, bufferLayout.attrStride,
                    bufferLayout.attr.position.offset);
                gl.enableVertexAttribArray(shaderLocations.attr.position);
                gl.uniformMatrix4fv(shaderLocations.uniform.matrix, false, new Float32Array(mat));
                gl.uniform4fv(shaderLocations.uniform.color, new Float32Array(color));
                gl.drawArrays(gl.LINE_STRIP, angleBegin, angleEnd - angleBegin);
                gl.disableVertexAttribArray(shaderLocations.attr.position);
            }
            this.draw = draw;
        }
        const arcRenderer = new ArcRenderer();
        function drawGrid(matEquToHor, matView, matProj){
            gl.enable(gl.BLEND);
            gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SOURCE_ALPHA, gl.ONE, gl.ONE);

            const matHorToProj = M4.mulM4(matProj, matView);
            for(let el = -90+15; el < 90; el += 15){
                arcRenderer.draw(
                    M4.mulM4(matHorToProj, M4.mulM4(M4.mulM4(M4.translate(0, Math.sin(el*DEG2RAD), 0), M4.scale(Math.cos(el*DEG2RAD))), M4.rotX(Math.PI/2))),
                    el==0 ? COLOR_HORIZON : COLOR_GRID);
            }
            for(let az = 0; az < 180; az += 15){
                const mat = M4.mulM4(matHorToProj, M4.mulM4(M4.rotY(az*DEG2RAD), M4.rotZ(90*DEG2RAD)));
                if(az == 90){
                    arcRenderer.draw(mat, COLOR_SOUTH, 0, 180);
                    arcRenderer.draw(mat, COLOR_NORTH, 180, 360);
                }
                else{
                    arcRenderer.draw(mat, COLOR_GRID);
                }
            }
            gl.disable(gl.BLEND);
        }

        //
        // WebGL Util
        //
        function compileShader(source, type)
        {
            var shader = gl.createShader(type); //gl.FRAGMENT_SHADER, VERTEX_SHADER
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            if(!gl.getShaderParameter(shader, gl.COMPILE_STATUS)){
                throw new Error("Failed to compile shader." + gl.getShaderInfoLog(shader));
            }
            return shader;
        }
        function createShaderProgram(vertexShaderSource, fragmentShaderSource)
        {
            var fragmentShader = compileShader(fragmentShaderSource, gl.FRAGMENT_SHADER);
            var vertexShader = compileShader(vertexShaderSource, gl.VERTEX_SHADER);
            var program = gl.createProgram();
            gl.attachShader(program, vertexShader);
            gl.attachShader(program, fragmentShader);
            gl.linkProgram(program);
            if(!gl.getProgramParameter(program, gl.LINK_STATUS)){
                throw new Error("Failed to link shader program. ");
            }
            return program;
        }

        function onResize(){
            gl.viewport(0, 0, cv.width, cv.height);
        }
        this.onResize = onResize;
    }//WebGLRenderer

    function Canvas2DRenderer(cv, stars)
    {
        const ctx = cv.getContext("2d");

        this.drawFrame = drawFrame;
        function drawFrame(matEquToHor, matView, matProj)
        {
            clear();
            drawGrid(matEquToHor, matView, matProj);
            drawStars(matEquToHor, matView, matProj);
        }

        function clear()
        {
            ctx.globalCompositeOperation = "source-over";
            ctx.fillStyle = "black";
            ctx.fillRect(0, 0, cv.width, cv.height);
        }

        function drawStars(matEquToHor, matView, matProj)
        {
            ctx.globalCompositeOperation = "lighter";
            for(var i = 0; i < stars.length; i += 4){
                const ra = stars[i+0]; //[rad]
                const dec = stars[i+1]; //[rad]

                const posEquatorial = dirRADec(ra, dec);// x+:6h, y+: North, z+:0h(Vernal Equinox)
                const posView = M4.mulV4(M4.mulM4(matView, matEquToHor), posEquatorial);
                // ステレオ投影しないなら中心からカメラ向きの反対側はこれ以上計算する必要が無い
                //if(posView[2] >= 0){
                //    continue;
                //}

                const pos = M4.mulV4(matProj, posView);
                const x = pos[0] / pos[3];
                const y = pos[1] / pos[3];
                const z = pos[2] / pos[3];
                if(!(x >= -1 && x <= 1 && y >= -1 && y <= 1 && z >= -1 && z <= 1)){
                    continue;
                }

                const vmag = stars[i+2]; //@todo hpmag to vmag ?
                const bv = stars[i+3];
                const appearance = calculateAppearanceOfStar(vmag, bv);
                ctx.fillStyle = "rgb(" +
                    ((appearance.red*255) | 0) + "," +
                    ((appearance.green*255) | 0) + "," +
                    ((appearance.blue*255) | 0) + ")";
                const r = appearance.radius * 0.5;
                ctx.beginPath();
                ctx.arc(cv.width/2*(1+x),
                        cv.height/2*(1-y), r, 0, 2*Math.PI, false);
                ctx.fill();
            }
        }

        function drawGrid(matEquToHor, matView, matProj){
            function v4f2rgba(v4f){
                return "rgba(" +
                    (clamp(255.0*v4f[0], 0, 255)|0) + "," +
                    (clamp(255.0*v4f[1], 0, 255)|0) + "," +
                    (clamp(255.0*v4f[2], 0, 255)|0) + "," +
                    (clamp(v4f[3], 0, 1.0)) + ")";
            }
            ctx.globalCompositeOperation = "source-over";
            ctx.lineWidth = 1;

            function Plotter(){
                var moved = false;
                this.begin = function(){
                    moved = false;
                    ctx.beginPath();
                };
                this.drawLine = function(az, el){
                    const posView = M4.mulV4(matView, dirAzEl(az*DEG2RAD, el*DEG2RAD));
                    const pos = M4.mulV4(matProj, posView);
                    const x = pos[0] / pos[3];
                    const y = pos[1] / pos[3];
                    const z = pos[2] / pos[3];
                    if(x >= -1 && x <= 1 && y >= -1 && y <= 1 && z >= -1 && z <= 1){
                        const xx = cv.width/2*(1+x);
                        const yy = cv.height/2*(1-y);
                        if(!moved){
                            ctx.moveTo(xx, yy);
                            moved = true;
                        }
                        else{
                            ctx.lineTo(xx, yy);
                        }
                    }
                    else{
                        moved = false;
                    }
                };
                this.end = function(){
                    ctx.stroke();
                };
            }

            let plotter = new Plotter();
            for(let el = -90; el <= 90; el += 15){
                ctx.strokeStyle = (el == 0) ? v4f2rgba(COLOR_HORIZON) : v4f2rgba(COLOR_GRID);
                plotter.begin();
                for(let az = 0; az <= 360; az += 15){
                    plotter.drawLine(az, el);
                }
                plotter.end();
            }
            for(let az = 0; az < 360; az += 15){
                ctx.strokeStyle = (az == 0) ? v4f2rgba(COLOR_SOUTH) : (az == 180) ? v4f2rgba(COLOR_NORTH) : v4f2rgba(COLOR_GRID);
                plotter.begin();
                for(let el = -90; el <= 90; el += 15){
                    plotter.drawLine(az, el);
                }
                plotter.end();
            }
        }

        function onResize(){
        }
        this.onResize = onResize;
    }//Canvas2DRenderer

    function bv2rgb(bv){
        // Star color - details: http://www.vendian.org/mncharity/dir3/starcolor/details.html
        // B-V (-0.40 to 2.00) (step:0.05)
        const BV_COLORS = [0x9bb2ff,0x9eb5ff,0xa3b9ff,0xaabfff,0xb2c5ff,0xbbccff,0xc4d2ff,0xccd8ff,0xd3ddff,0xdae2ff,0xdfe5ff,0xe4e9ff,0xe9ecff,0xeeefff,0xf3f2ff,0xf8f6ff,0xfef9ff,0xfff9fb,0xfff7f5,0xfff5ef,0xfff3ea,0xfff1e5,0xffefe0,0xffeddb,0xffebd6,0xffe9d2,0xffe8ce,0xffe6ca,0xffe5c6,0xffe3c3,0xffe2bf,0xffe0bb,0xffdfb8,0xffddb4,0xffdbb0,0xffdaad,0xffd8a9,0xffd6a5,0xffd5a1,0xffd29c,0xffd096,0xffcc8f,0xffc885,0xffc178,0xffb765,0xffa94b,0xff9523,0xff7b00,0xff5200];
        const BV_COLORS_MIN = -0.40;
        const BV_COLORS_MAX = 2.00;
        const BV_COLORS_STEP = 0.05;

        function unpack(c){return {r:c>>16&255, g:c>>8&255, b:c&255};}
        function interpolate(x, y, a){return x*(1.0-a)+y*a;}
        const indexF = (bv - BV_COLORS_MIN) / BV_COLORS_STEP;
        const index = Math.floor(indexF);
        const alpha = indexF - index;
        if(index < 0){
            return unpack(BV_COLORS[0]);
        }
        else if(index + 1 < BV_COLORS.length){
            const c0 = unpack(BV_COLORS[index]);
            const c1 = unpack(BV_COLORS[index + 1]);
            return {r:interpolate(c0.r, c1.r, alpha), g:interpolate(c0.g, c1.g, alpha), b:interpolate(c0.b, c1.b, alpha)};
        }
        else if(index >= 0){
            return unpack(BV_COLORS[BV_COLORS.length - 1]);
        }
        else{
            return bv; //NaN
        }
    }

    function calculateAppearanceOfStar(mag, bv){
        const MAX_MAG = 3.0; // magnitude where intensity==INTENSITY_SCALE
        const INTENSITY_SCALE = 1;
        const INTENSITY_MAX = 10;
        const INTENSITY_MIN = 0.0;
        let intensity = clamp(INTENSITY_SCALE / Math.pow(10, (mag - MAX_MAG)/2.5), INTENSITY_MIN, INTENSITY_MAX);

        // 暗い星だけを底上げする。
        if(intensity < 0.5){
            intensity = intensity * 0.75 + 0.125;
        }

        // intensity < 1.0は色で表現する。
        const c = clamp(intensity, 0, 1);
        const color = bv2rgb(bv);
        const cr = (c * color.r) / 255.0;
        const cg = (c * color.g) / 255.0;
        const cb = (c * color.b) / 255.0;

        // intensity > 1.0は飽和するので半径で表現する。
        const MIN_RADIUS = 1.0; //pi*1.0^2の面積でintensity<1.0を表現する。
        const MAX_RADIUS = 6;
        const r = clamp(Math.sqrt(intensity), MIN_RADIUS, MAX_RADIUS);

        return {
            red: cr,
            green: cg,
            blue: cb,
            radius: r
        };
    }

    //
    // Control
    //

    function StarChartController(starChart){
        const cv = starChart.getCV();

        //
        // Touch
        //
        const currentTouches = [];
        function findCurrentTouchById(id){
            return currentTouches.findIndex((t)=>t.id==id);
        }
        function averageXY(touches){
            let x = 0, y = 0;
            for(let i = 0; i < touches.length; ++i){
                x += touches[i].x;
                y += touches[i].y;
            }
            return {x: x / touches.length,
                    y: y / touches.length};
        }

        let touchStartState;
        function refreshTouchStartState(){
            touchStartState = {
                fov: starChart.getFOV(),
                viewAz: starChart.getViewAz(),
                viewEl: starChart.getViewEl(),
                touches: currentTouches.slice(),
                center: averageXY(currentTouches)
            };
        }

        cv.addEventListener("touchstart", onTouchStart, false);
        cv.addEventListener("touchend", onTouchEnd, false);
        cv.addEventListener("touchcancel", onTouchCancel, false);
        cv.addEventListener("touchmove", onTouchMove, false);
        function onTouchStart(ev){
            ev.preventDefault();
            const touches = ev.changedTouches;
            for(let ti = 0; ti < touches.length; ++ti){
                currentTouches.push({
                    id: touches[ti].identifier,
                    x: touches[ti].clientX,
                    y: touches[ti].clientY,
                });
            }
            refreshTouchStartState();
        }
        function onTouchEnd(ev){
            ev.preventDefault();
            const touches = ev.changedTouches;
            for(let ti = 0; ti < touches.length; ++ti){
                const index = findCurrentTouchById(touches[ti].identifier);
                if(index >= 0){
                    currentTouches.splice(index);
                }
            }
            refreshTouchStartState();
        }
        function onTouchCancel(ev){
            onTouchEnd(ev);
        }
        function onTouchMove(ev){
            ev.preventDefault();
            const touches = ev.changedTouches;
            for(let ti = 0; ti < touches.length; ++ti){
                const index = findCurrentTouchById(touches[ti].identifier);
                if(index >= 0){
                    currentTouches[index] = {
                        id: touches[ti].identifier,
                        x: touches[ti].clientX,
                        y: touches[ti].clientY,
                    };
                }
            }

            const anglePerPixel = 120 / cv.height;
            // Move
            if(currentTouches.length >= 1 && touchStartState.touches.length >= 1){
                const currCenter = averageXY(currentTouches);
                const dx = (currCenter.x - touchStartState.center.x) * anglePerPixel;
                const dy = (currCenter.y - touchStartState.center.y) * anglePerPixel;
                starChart.setViewDir(
                    touchStartState.viewAz - dx,
                    touchStartState.viewEl + dy);
            }

            // Zoom
            if(currentTouches.length >= 2 && touchStartState.touches.length >= 2){
                const startDistanceX = touchStartState.touches[0].x - touchStartState.touches[1].x;
                const startDistanceY = touchStartState.touches[0].y - touchStartState.touches[1].y;
                const startDistance = Math.sqrt(startDistanceX*startDistanceX + startDistanceY*startDistanceY);
                const currDistanceX = currentTouches[0].x - currentTouches[1].x;
                const currDistanceY = currentTouches[0].y - currentTouches[1].y;
                const currDistance = Math.sqrt(currDistanceX*currDistanceX + currDistanceY*currDistanceY);
                const delta = (currDistance - startDistance) * anglePerPixel;
                starChart.setFOV(touchStartState.fov - delta);
            }
        }

        // Mouse
        cv.addEventListener("mousedown", onMouseDown, false);
        cv.addEventListener("mouseup", onMouseUp, false);
        cv.addEventListener("mousemove", onMouseMove, false);
        cv.addEventListener("wheel", onMouseWheel, false);
        var mouseDownState = null;
        function onMouseDown(ev){
            ev.preventDefault();
            mouseDownState = {x:ev.clientX, y:ev.clientY, viewAz:starChart.getViewAz(), viewEl:starChart.getViewEl()};
        }
        function onMouseUp(ev){
            ev.preventDefault();
            mouseDownState = null;
        }
        function onMouseMove(ev){
            const anglePerPixel = 2 * starChart.getFOV() / cv.height;
            if(mouseDownState){
                ev.preventDefault();
                starChart.setViewDir(
                    mouseDownState.viewAz - (ev.clientX - mouseDownState.x) * anglePerPixel,
                    mouseDownState.viewEl + (ev.clientY - mouseDownState.y) * anglePerPixel);
            }
        }
        function onMouseWheel(ev){
            ev.preventDefault();
            starChart.zoom(ev.deltaY * 0.01);
        }
    }

    //
    // Load Star Catalog
    //

    function loadCatalogJS(filename, catalogSymbol){
        let script = document.createElement("script");
        script.src = filename;
        document.head.appendChild(script);
        return new Promise(function(resolve, reject){
            script.onload = function(){
                resolve(window[catalogSymbol]);
            };
        });
    }
    function loadCatalogBinary(url){
        return new Promise(function(resolve, reject){
            fetch(url).then(function(response){
                if(!response.ok){
                    throw new Error("HTTP error, status=" + response.status);
                }
                return response.arrayBuffer();
            }).then(function(buffer){
                const floats = new DataView(buffer);
                const numStars = Math.floor(buffer.byteLength / (4 * 4));
                const numFloats = numStars * 4;
                const stars = new Array(numFloats);
                for(let i = 0; i < numFloats; ++i){
                    stars[i] = floats.getFloat32(i*4);
                }
                resolve(stars);
            });
        });
    }

    function setup(stars, options){
        const starChart = new StarChart(stars, options);
        const controller = new StarChartController(starChart);
    }

    function parseQueryString()
    {
        const options = {};
        const q = document.location.search.substr(1);
        if(q.length > 0){
            const ps = q.split("&");
            for(let pi = 0; pi < ps.length; ++pi){
                const kv = ps[pi].split("=");
                const key = kv[0];
                const value = decodeURI(kv[1].replace(/\+/g, " "));
                switch(key){
                case "fov":
                case "ra":
                case "dec":
                case "az":
                case "el":
                case "lng":
                case "lat":
                    options[key] = parseFloat(value); break;
                case "renderer":
                    options[key] = value; break;
                }
            }
        }
        return options;
    }

    function LoadingText(){
        let div = document.createElement("div");
        div.innerHTML = "Loading Stars...";
        document.body.appendChild(div);
        this.remove = function(){
            if(div){
                div.parentNode.removeChild(div);
                div = null;
            }
        };
    }

    function main(){
        let options = parseQueryString();

        let loadingText = new LoadingText();
        function onLoadStars(stars){
            loadingText.remove();

            setup(stars, options);
        }
        if(document.location.protocol == "file:"){
            loadCatalogJS("catalog/hip2/hip2_ra_dec_mag_bv.js", "HIP2_STARS").then(onLoadStars);
        }
        else{
            loadCatalogBinary("catalog/hip2/hip2_ra_dec_mag_bv.dat").then(onLoadStars);
        }
    }

    window.Hoshizora = {
        main: main
    };
})();
