import { makeBasicExample } from '../../components/basicExample';
import glslangModule from '../../glslang';

async function init(canvas: HTMLCanvasElement) {
  // Set video element
  const video = document.createElement('video');
  video.loop = true;
  video.autoplay = true;
  video.muted = true;
  video.src = require('../../../assets/video/pano.webm');
  await video.play();

  const adapter = await navigator.gpu.requestAdapter();
  const device = await adapter.requestDevice();
  const glslang = await glslangModule();
  const context = canvas.getContext('gpupresent');

  const swapChainFormat = 'bgra8unorm';

  // prettier-ignore
  const rectVerts = new Float32Array([
    1.0,  1.0, 0.0, 1.0, 0.0,
    1.0, -1.0, 0.0, 1.0, 1.0,
    -1.0, -1.0, 0.0, 0.0, 1.0,
    1.0,  1.0, 0.0, 1.0, 0.0,
    -1.0, -1.0, 0.0, 0.0, 1.0,
    -1.0,  1.0, 0.0, 0.0, 0.0,
  ]);

  const verticesBuffer = device.createBuffer({
    size: rectVerts.byteLength,
    usage: GPUBufferUsage.VERTEX,
    mappedAtCreation: true,
  });
  new Float32Array(verticesBuffer.getMappedRange()).set(rectVerts);
  verticesBuffer.unmap();

  const swapChain = context.configureSwapChain({
    device,
    format: swapChainFormat,
  });

  const pipeline = device.createRenderPipeline({
    vertexStage: {
      module: device.createShaderModule({
        code: glslShaders.vertex,
        transform: (glsl) => glslang.compileGLSL(glsl, 'vertex'),
      }),
      entryPoint: 'main',
    },
    fragmentStage: {
      module: device.createShaderModule({
        code: glslShaders.fragment,
        transform: (glsl) => glslang.compileGLSL(glsl, 'fragment'),
      }),
      entryPoint: 'main',
    },

    primitiveTopology: 'triangle-list',
    vertexState: {
      vertexBuffers: [
        {
          arrayStride: 20,
          attributes: [
            {
              // position
              shaderLocation: 0,
              offset: 0,
              format: 'float3',
            },
            {
              // uv
              shaderLocation: 1,
              offset: 12,
              format: 'float2',
            },
          ],
        },
      ],
    },

    colorStates: [
      {
        format: swapChainFormat,
      },
    ],
  });

  const sampler = device.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
  });

  const videoTexture = device.createTexture({
    size: {
      width: video.videoWidth,
      height: video.videoHeight,
      depth: 1,
    },
    format: 'rgba8unorm',
    usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.SAMPLED,
  });

  const uniformBindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      {
        binding: 0,
        resource: sampler,
      },
      {
        binding: 1,
        resource: videoTexture.createView(),
      },
    ],
  });

  return function frame() {
    createImageBitmap(video).then((videoFrame) => {
      device.defaultQueue.copyImageBitmapToTexture(
        { imageBitmap: videoFrame, origin: { x: 0, y: 0 } },
        { texture: videoTexture },
        { width: video.videoWidth, height: video.videoHeight, depth: 1 }
      );

      const commandEncoder = device.createCommandEncoder();
      const textureView = swapChain.getCurrentTexture().createView();

      const renderPassDescriptor = {
        colorAttachments: [
          {
            attachment: textureView,
            loadValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
          },
        ],
      };

      const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
      passEncoder.setPipeline(pipeline);
      passEncoder.setVertexBuffer(0, verticesBuffer);
      passEncoder.setBindGroup(0, uniformBindGroup);
      passEncoder.draw(6, 1, 0, 0);
      passEncoder.endPass();
      device.defaultQueue.submit([commandEncoder.finish()]);
    });
  };
}

const glslShaders = {
  vertex: `#version 450
layout(location = 0) in vec3 position;
layout(location = 1) in vec2 uv;

layout(location = 0) out vec2 fragUV;

void main() {
  gl_Position = vec4(position, 1.0);
  fragUV = uv;
}
`,

  fragment: `#version 450
layout(set = 0, binding = 0) uniform sampler mySampler;
layout(set = 0, binding = 1) uniform texture2D myTexture;

layout(location = 0) in vec2 fragUV;
layout(location = 0) out vec4 outColor;

void main() {
  outColor = texture(sampler2D(myTexture, mySampler), fragUV);
}
`,
};

const wgslShaders = {
  vertex: `
[[location(0)]] var<in> position : vec3<f32>;
[[location(1)]] var<in> uv : vec2<f32>;

[[location(0)]] var<out> fragUV : vec2<f32>;
[[builtin(position)]] var<out> Position : vec4<f32>;

void main() {
  Position = vec4(position, 1.0);
  fragUV = uv;
}
`,

  fragment: `
[[binding(0), group(0)]] var<uniform_constant> mySampler: sampler;
[[binding(1), group(0)]] var<uniform_constant> myTexture: texture_2d<f32>;

[[location(0)]] var<in> fragUV : vec2<f32>;
[[location(0)]] var<out> outColor : vec4<f32>;

[[stage(fragment)]]
fn main() -> void {
  outColor =  textureSample(myTexture, mySampler, fragUV);
  return;
}
`,
};

export default makeBasicExample({
  name: 'Video Uploading',
  description: 'This example shows how to upload video frame to WebGPU.',
  slug: 'videoUploading',
  init,
  glslShaders,
  wgslShaders,
  source: __SOURCE__,
});
