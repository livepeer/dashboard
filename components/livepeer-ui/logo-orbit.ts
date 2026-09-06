export const ORBIT_PERSPECTIVE = 800;
const TILT_X = Math.PI * 0.31;
const TILT_Z = Math.PI * 0.16;

export function logoOrbitPose(angle: number, radius: number) {
  const circleX = Math.cos(angle) * radius;
  const circleY = Math.sin(angle) * radius;
  const tiltedY = circleY * Math.cos(TILT_X);
  const depth = (Math.sin(angle) + 1) / 2;
  return {
    x: circleX * Math.cos(TILT_Z) - tiltedY * Math.sin(TILT_Z),
    y: circleX * Math.sin(TILT_Z) + tiltedY * Math.cos(TILT_Z),
    z: circleY * Math.sin(TILT_X),
    depth,
    blur: Math.pow(1 - depth, 1.6) * 5,
    scale: 0.68 + depth * 0.32,
  };
}

const rotationSamples = Array.from({ length: 360 }, (_, index) =>
  logoOrbitPose((index / 360) * Math.PI * 2, 1)
);

/** Fit the complete projected rotation, not just the unprojected circle. */
export function fitLogoOrbitRadius(
  width: number,
  height: number,
  logoSize: number
) {
  let low = 0;
  let high = Math.min(width * 0.34, height * 0.66, ORBIT_PERSPECTIVE * 0.5);
  const fits = (radius: number) =>
    rotationSamples.every((pose) => {
      const projection =
        ORBIT_PERSPECTIVE / (ORBIT_PERSPECTIVE - pose.z * radius);
      // Include the logo box and three blur standard deviations. A small gutter
      // covers subpixel rounding and extrema between the one-degree samples.
      const halfExtent = (logoSize / 2 + 3 * pose.blur) * pose.scale;
      return (
        (Math.abs(pose.x * radius) + halfExtent) * projection <=
          width / 2 - 4 &&
        (Math.abs(pose.y * radius) + halfExtent) * projection <= height / 2 - 4
      );
    });
  for (let step = 0; step < 16; step++) {
    const midpoint = (low + high) / 2;
    if (fits(midpoint)) low = midpoint;
    else high = midpoint;
  }
  return low;
}
