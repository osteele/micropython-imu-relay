let modelObj;  // setup initializes this to a p5.js 3D model
const deviceData = {};  // sensor data for each device, indexed by device id

const AXIS_LENGTH = 400;

const modelSettings = {
    draw_axes: false,
    model_name: 'bunny',
}

function loadModelFromSettings() {
    let modelName = modelSettings.model_name || 'bunny';
    if (!modelName.match(/\.(obj|stl)$/)) {
        modelName += '.obj';
    }
    modelObj = loadModel('models/' + modelName, true);
}

if (window.dat) {
    const gui = new dat.GUI();
    // gui.remember(modelSettings);
    gui.add(modelSettings, 'draw_axes').name('Draw axes');
    gui.add(modelSettings, 'model_name').name('Model name').onFinishChange(loadModelFromSettings);
}

function setup() {
    createCanvas(800, 800, WEBGL);
    loadModelFromSettings();
}

function draw() {
    const currentTime = +new Date();

    background(200, 200, 212);
    noStroke();
    lights();
    orbitControl();

    const models = Object.values(deviceData);
    // apply the physics simulation just to the models that have recent sensor data
    updatePhysics(
        models.filter(({ local_timestamp }) => currentTime - local_timestamp < 500)
    );

    models.forEach(data => {
        push();
        if (data.position) { translate.apply(null, data.position); }

        // Read the rotation. This is a quaternion; convert it to Euler angles.
        const [q0, q1, q2, q3] = data.quaternion;
        const orientationMatrix = quatToMatrix(q3, q1, q0, q2);
        applyMatrix.apply(null, orientationMatrix);

        if (modelSettings.draw_axes) {
            drawAxes();
        }

        // Fade the model out if the sensor data is stale
        const age = Math.max(0, currentTime - data.local_timestamp - 250);
        const alpha = Math.max(5, 255 - age / 10);
        fill(255, 255, 255, alpha);

        // show uncalibrated models in red
        if (data.calibration === 0) {
            fill(255, 0, 0, alpha);
        }

        rotateZ(Math.PI);
        noStroke();
        model(modelObj);

        pop();
    });
}

function drawAxes() {
    strokeWeight(3);
    [0, 1, 2].forEach(i => {
        const color = [0, 0, 0];
        const vector = [0, 0, 0, 0, 0, 0];
        color[i] = 128;
        vector[i + 3] = AXIS_LENGTH;
        stroke.apply(null, color);
        line.apply(null, vector);
    });
}

function updatePhysics(models) {
    // initialize positions and velocities of new models
    models.forEach(data => {
        if (!data.position) {
            const e = 0.0001;
            // const e = 1000;
            function rand() {
                return (Math.random() - 0.5) * e;
            }
            data.position = [rand(), rand(), rand()];
            data.velocity = [0, 0, 0];
        }
    });

    // Apply spring forces between every object pair
    models.forEach(d1 => {
        models.forEach(d2 => {
            if (d1 === d2) { return; }
            const v = d1.position.map((p0, i) => d2.position[i] - p0);
            const len = Math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2);
            const v_norm = v.map(x => x / len);
            const f = (len - 500) * .001;
            const vf = v_norm.map(x => x * f);
            d1.velocity = d1.velocity.map((x, i) => x + vf[i]);
            d2.velocity = d2.velocity.map((x, i) => x - vf[i]);
        });
    });

    // Add velocities to positions. Spring positions to origin. Damp velocities.
    models.forEach(data => {
        const { position, velocity } = data;
        data.position = position.map((x, i) => (x + velocity[i]) * 0.99)
        data.velocity = velocity.map(v => v * 0.99)
    });
}

function quatToMatrix(w, x, y, z) {
    const x2 = x ** 2, y2 = y ** 2, z2 = z ** 2,
        wx = w * x, wy = w * y, wz = w * z,
        xy = x * y, xz = x * z, yz = y * z;
    return [
        1 - 2 * (y2 + z2), 2 * (xy - wz), 2 * (xz + wy), 0,
        2 * (xy + wz), 1 - 2 * (x2 + z2), 2 * (yz - wx), 0,
        2 * (xz - wy), 2 * (yz + wx), 1 - 2 * (x2 + y2), 0,
        0, 0, 0, 1
    ];
}

onSensorData((data) => {
    const device_id = data.device_id;
    deviceData[device_id] = { ...(deviceData[device_id] || {}), ...data };
});
