// Note: You can import your separate WGSL shader files like this.
import particleWGSL from './shaders/particles.wgsl';

let device: GPUDevice;
let context: GPUCanvasContext;
let renderPipeline: GPURenderPipeline;
let computePipeline: GPUComputePipeline;
let computeBindGroup: GPUBindGroup;
let pointBuffer: GPUBuffer;

let mousePositionData: DataView;
let mousePositionUniformBuffer: GPUBuffer;

const workgroupSize = 256;
const approximateParticleCount = 5_000_000;

const particleCount = Math.ceil(approximateParticleCount / workgroupSize) * workgroupSize;

export default function init(
  ctx: GPUCanvasContext,
  gpuDevice: GPUDevice
): void {
  device = gpuDevice;
  context = ctx;

  const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
  context.configure({
    device: gpuDevice,
    format: presentationFormat,
    alphaMode: 'opaque',
  });

  const particleShaderModule = device.createShaderModule({
    code: particleWGSL,
    label: "Particle shader module"
  });

  renderPipeline = device.createRenderPipeline({
    label: "Particle render pipeline",
    layout: 'auto',
    vertex: {
      module: particleShaderModule,
      entryPoint: 'main_vs',
      buffers: [
        {
          arrayStride: 4 * 4, // 4 floats, 4 bytes each
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x4' },  // position
          ],
        },
      ],
    },
    fragment: {
      module: particleShaderModule,
      entryPoint: 'main_fs',
      targets: [
        {
          format: presentationFormat,
        },
      ]
    },
    primitive: {
      // topology: 'triangle-list',
      topology: 'point-list',
    },
  });
  
  computePipeline = device.createComputePipeline({
    label: "Particle compute pipeline",
    compute: {
      module: particleShaderModule,
      entryPoint: "main_compute",
      constants: { workgroupSize }
    },
    layout: 'auto'
  });

  const rand = (min, max) => min + Math.random() * (max - min);
 
  const pointPositions = new Float32Array(particleCount * 4);
  for (let i = 0; i < particleCount; ++i) {
    const offset = i * 4;
    pointPositions[offset + 0] = rand(-1, 1);
    pointPositions[offset + 1] = rand(-1, 1);
    pointPositions[offset + 2] = rand(-0.1, 0.1);
    pointPositions[offset + 3] = rand(-0.1, 0.1);
  }
 
  pointBuffer = device.createBuffer({
    label: 'Particle positions',
    size: pointPositions.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE,
  });
  device.queue.writeBuffer(pointBuffer, 0, pointPositions);

  const uniformsSize = 4 * 6;
  mousePositionUniformBuffer = device.createBuffer({
    label: "Mouse position uniform buffer",
    size: uniformsSize, // 2 u32s for mouse position, 2 u32s for screen size
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  });
  mousePositionData = new DataView(new ArrayBuffer(uniformsSize));
  mousePositionData.setUint32(8, window.innerWidth, true);
  mousePositionData.setUint32(12, window.innerHeight, true);
  window.addEventListener("resize", () => {
    mousePositionData.setUint32(8, window.innerWidth, true);
    mousePositionData.setUint32(12, window.innerHeight, true);
  });
  device.queue.writeBuffer(mousePositionUniformBuffer, 0, mousePositionData.buffer);

  computeBindGroup = device.createBindGroup({
    label: "Particle compute bind group",
    layout: computePipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: {
        label: "Particle point buffer binding",
        buffer: pointBuffer
      } },
      { binding: 1, resource: {
        label: "Mouse position uniform buffer binding",
        buffer: mousePositionUniformBuffer
      } }
    ]
  });

  document.addEventListener("mousedown", (e) => {
    mousePositionData.setUint32(16, 1, true);
  });
  document.addEventListener("mouseup", (e) => {
    mousePositionData.setUint32(16, 0, true);
  });
  document.addEventListener("mousemove", (e) => {
    mousePositionData.setUint32(0, e.clientX, true);
    mousePositionData.setUint32(4, window.innerHeight - e.clientY, true);
  });

  requestAnimationFrame(render);
}

let lastElapsed = 0;
function render(totalElapsed: number) {
  const deltaSeconds = (totalElapsed - lastElapsed) / 1000;
  lastElapsed = totalElapsed;

  const framerate = 1 / deltaSeconds;
  document.getElementById("debug").innerText = `Framerate: ${Math.round(framerate)}\nParticles: 5,000,000`;

  const commandEncoder = device.createCommandEncoder();
  const textureView = context.getCurrentTexture().createView();

  const renderPassDescriptor: GPURenderPassDescriptor = {
    colorAttachments: [
      {
        view: textureView,
        clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
  };
  
  device.queue.writeBuffer(mousePositionUniformBuffer, 0, mousePositionData.buffer);

  const computePassEncoder = commandEncoder.beginComputePass({
    label: "Particle compute pass descriptor"
  });
  computePassEncoder.setPipeline(computePipeline);
  computePassEncoder.setBindGroup(0, computeBindGroup);
  computePassEncoder.dispatchWorkgroups(particleCount / workgroupSize, 1, 1);
  computePassEncoder.end();

  const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
  passEncoder.setPipeline(renderPipeline);
  passEncoder.setVertexBuffer(0, pointBuffer);
  passEncoder.draw(particleCount);
  passEncoder.end();

  device.queue.submit([commandEncoder.finish()]);
  
  requestAnimationFrame(render);
}