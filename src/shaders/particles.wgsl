struct Particle {
  @location(0) position: vec2f,
  @location(1) velocity: vec2f
};

struct VSOutput {
  @builtin(position) position: vec4f,
  @location(0) clip_space: vec2f,
  @location(1) vel: f32
};


@vertex fn main_vs(@location(0) vert: vec4f) -> VSOutput {
  var out: VSOutput;
  out.position = vec4f(vert.x, vert.y, 1., 1.);
  out.vel = sqrt(vert.z * vert.z + vert.w * vert.w);
  out.clip_space = vec2f(vert.x, vert.y) * 0.5 + 0.5;
  return out;
}

@fragment fn main_fs(out: VSOutput) -> @location(0) vec4f {
  return mix(
    vec4f(out.clip_space.x, out.clip_space.y, out.clip_space.y * 0.25 + 0.75, 0.2),
    vec4f(1., 1., 1., 0.5),
    max(0, out.vel * 0.001)
  );
}

@group(0) @binding(0) var<storage, read_write> particles: array<Particle>;

struct Uniforms {
  @location(0) mousePosition: vec2<u32>,
  @location(1) screenResolution: vec2<u32>,
  @location(2) mouseDown: u32
};

@group(0) @binding(1) var<uniform> uniforms: Uniforms;

override workgroupSize: u32 = 0;

fn to_screen_pos(pos: vec2f) -> vec2f {
  return vec2f(
    (pos.x * 0.5 + 0.5) * f32(uniforms.screenResolution.x),
    (pos.y * 0.5 + 0.5) * f32(uniforms.screenResolution.y)
  );
}
fn to_clip_pos(pos: vec2f) -> vec2f {
  return vec2f( 
    pos.x / f32(uniforms.screenResolution.x) * 2 - 1,
    pos.y / f32(uniforms.screenResolution.y) * 2 - 1
  );
}

@compute @workgroup_size(workgroupSize, 1, 1)
fn main_compute(
  @builtin(local_invocation_id) local_invocation_id: vec3u,
  @builtin(workgroup_id) workgroup_id: vec3u,
) {
  var idx: u32 = workgroup_id.x * workgroupSize + local_invocation_id.x;

  var particle: Particle = particles[idx];

  var screenPos: vec2f = to_screen_pos(particle.position);

  var delta: f32 = 1 / 30.;
  var decay: f32 = 1 / (1 + delta * 1);

  var x: f32 = screenPos.x;
  var y: f32 = screenPos.y;
  var dx: f32 = particle.velocity.x * decay;
  var dy: f32 = particle.velocity.y * decay;

  if(uniforms.mouseDown == 1) {
    var tx = f32(uniforms.mousePosition.x) - x;
    var ty = f32(uniforms.mousePosition.y) - y;
    var dist = sqrt(tx * tx + ty * ty);
    var dirX = tx / dist;
    var dirY = ty / dist;
    var force = 3 * min(1200, 25830000 / (dist * dist));
    dx += dirX * force * delta;
    dy += dirY * force * delta;
  }

  particles[idx].position = to_clip_pos(vec2f(x + dx * delta, y + dy * delta));
  particles[idx].velocity.x = dx;
  particles[idx].velocity.y = dy;
}