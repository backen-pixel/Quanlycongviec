/**
 * Double-door luxury rigid box — sát cấu trúc Pacdora:
 * greyboard trong/ngoài + giấy bọc + connection paper.
 * Đơn vị mm. Input L,W,H,T (inner) theo mm.
 */

function r2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function blank(w, h) {
  return { w: r2(w / 10), h: r2(h / 10) };
}

/** Cross tray greyboard (đáy + 4 thành). */
function hardboardTray({ L, W, H, T, label, kind }) {
  const ox = H;
  const oy = H;
  const width = L + 2 * H;
  const height = W + 2 * H;
  const cut = [
    [ox, 0],
    [ox + L, 0],
    [ox + L, oy],
    [ox + L + H, oy],
    [ox + L + H, oy + W],
    [ox + L, oy + W],
    [ox + L, oy + W + H],
    [ox, oy + W + H],
    [ox, oy + W],
    [0, oy + W],
    [0, oy],
    [ox, oy],
  ];
  const creases = [
    { x1: ox, y1: oy, x2: ox + L, y2: oy },
    { x1: ox, y1: oy + W, x2: ox + L, y2: oy + W },
    { x1: ox, y1: oy, x2: ox, y2: oy + W },
    { x1: ox + L, y1: oy, x2: ox + L, y2: oy + W },
  ];
  // Bleed offset ngoài cut ~2mm
  const b = 2;
  const bleed = [
    [ox - b, -b],
    [ox + L + b, -b],
    [ox + L + b, oy - b],
    [ox + L + H + b, oy - b],
    [ox + L + H + b, oy + W + b],
    [ox + L + b, oy + W + b],
    [ox + L + b, oy + W + H + b],
    [ox - b, oy + W + H + b],
    [ox - b, oy + W + b],
    [-b, oy + W + b],
    [-b, oy - b],
    [ox - b, oy - b],
  ];
  return {
    kind,
    material: 'hardboard',
    label,
    L,
    W,
    H,
    T,
    width,
    height,
    panels: {
      bottom: { x: ox, y: oy, w: L, h: W, role: 'bottom' },
      left: { x: 0, y: oy, w: H, h: W, role: 'left' },
      right: { x: ox + L, y: oy, w: H, h: W, role: 'right' },
      back: { x: ox, y: 0, w: L, h: H, role: 'back' },
      front: { x: ox, y: oy + W, w: L, h: H, role: 'front' },
    },
    cut,
    creases,
    bleed,
    blankSizeCm: blank(width, height),
  };
}

/**
 * Giấy bọc khay: lớn hơn hardboard, canh rìa wrap-in + cắt góc (không chồng góc).
 */
function wrappingForTray(tray, wrapIn = 15) {
  const { L, W, H, T } = tray;
  const bottomL = L + 2 * T;
  const bottomW = W + 2 * T;
  const wall = H;
  const wi = wrapIn;
  const arm = wall + wi;
  const ox = arm;
  const oy = arm;
  const width = bottomL + 2 * arm;
  const height = bottomW + 2 * arm;

  // Cross cut với notch góc (Pacdora-style wrap flaps)
  const cut = [
    // back outer
    [ox, 0],
    [ox + bottomL, 0],
    // notch back-right
    [ox + bottomL, wi],
    [ox + bottomL + wi, wi],
    [ox + bottomL + wi, oy],
    // right outer
    [ox + bottomL + arm, oy],
    [ox + bottomL + arm, oy + bottomW],
    // notch right-front
    [ox + bottomL + wi, oy + bottomW],
    [ox + bottomL + wi, oy + bottomW + wi],
    [ox + bottomL, oy + bottomW + wi],
    // front outer
    [ox + bottomL, oy + bottomW + arm],
    [ox, oy + bottomW + arm],
    // notch front-left
    [ox, oy + bottomW + wi],
    [ox - wi, oy + bottomW + wi],
    [ox - wi, oy + bottomW],
    // left outer
    [0, oy + bottomW],
    [0, oy],
    // notch left-back
    [ox - wi, oy],
    [ox - wi, wi],
    [ox, wi],
  ];

  const creases = [
    // bottom panel
    { x1: ox, y1: oy, x2: ox + bottomL, y2: oy },
    { x1: ox, y1: oy + bottomW, x2: ox + bottomL, y2: oy + bottomW },
    { x1: ox, y1: oy, x2: ox, y2: oy + bottomW },
    { x1: ox + bottomL, y1: oy, x2: ox + bottomL, y2: oy + bottomW },
    // wall / wrap-in
    { x1: ox, y1: wi, x2: ox + bottomL, y2: wi },
    { x1: ox, y1: oy + bottomW + wall, x2: ox + bottomL, y2: oy + bottomW + wall },
    { x1: wi, y1: oy, x2: wi, y2: oy + bottomW },
    { x1: ox + bottomL + wall, y1: oy, x2: ox + bottomL + wall, y2: oy + bottomW },
  ];

  const b = 3;
  const bleed = cut.map(([x, y]) => {
    const cx = width / 2;
    const cy = height / 2;
    const dx = x - cx;
    const dy = y - cy;
    const len = Math.hypot(dx, dy) || 1;
    return [x + (dx / len) * b, y + (dy / len) * b];
  });

  return {
    kind: tray.kind + '_wrap',
    material: 'wrapping',
    label: tray.label.replace('Hard board', 'Wrapping paper').replace('Chipboard', 'Giấy bọc'),
    L: bottomL,
    W: bottomW,
    H: arm,
    T,
    width,
    height,
    panels: {
      bottom: { x: ox, y: oy, w: bottomL, h: bottomW, role: 'bottom' },
      left: { x: 0, y: oy, w: arm, h: bottomW, role: 'left+wrap' },
      right: { x: ox + bottomL, y: oy, w: arm, h: bottomW, role: 'right+wrap' },
      back: { x: ox, y: 0, w: bottomL, h: arm, role: 'back+wrap' },
      front: { x: ox, y: oy + bottomW, w: bottomL, h: arm, role: 'front+wrap' },
    },
    cut,
    creases,
    bleed,
    blankSizeCm: blank(width, height),
  };
}

/** Tấm đáy exterior (chỉ panel đáy). */
function exteriorBottomBoard({ L, W, T }) {
  const pad = 2;
  return {
    kind: 'ext_bottom_board',
    material: 'hardboard',
    label: 'Bottom hard board of exterior box',
    L,
    W,
    H: 0,
    T,
    width: L,
    height: W,
    panels: { bottom: { x: 0, y: 0, w: L, h: W, role: 'bottom' } },
    cut: [
      [0, 0],
      [L, 0],
      [L, W],
      [0, W],
    ],
    creases: [],
    bleed: [
      [-pad, -pad],
      [L + pad, -pad],
      [L + pad, W + pad],
      [-pad, W + pad],
    ],
    blankSizeCm: blank(L, W),
  };
}

/**
 * Cánh cửa exterior: panel cửa (L/2 x W) + thành bên (H x W).
 * Connection paper = dải bản lề hẹp.
 */
function doorHardboard({ L, W, H, T, side }) {
  const doorW = r2(L / 2 + T * 0.5);
  const wall = H;
  const width = doorW + wall;
  const height = W;
  const doorX = side === 'left' ? 0 : wall;
  const wallX = side === 'left' ? doorW : 0;

  return {
    kind: `ext_door_${side}`,
    material: 'hardboard',
    label: side === 'left' ? 'Left door hard board' : 'Right door hard board',
    side,
    L: doorW,
    W,
    H: wall,
    T,
    width,
    height,
    panels: {
      door: { x: doorX, y: 0, w: doorW, h: W, role: 'door' },
      wall: { x: wallX, y: 0, w: wall, h: W, role: 'wall' },
    },
    cut: [
      [0, 0],
      [width, 0],
      [width, height],
      [0, height],
    ],
    creases: [
      {
        x1: side === 'left' ? doorW : wall,
        y1: 0,
        x2: side === 'left' ? doorW : wall,
        y2: W,
      },
    ],
    bleed: [
      [-2, -2],
      [width + 2, -2],
      [width + 2, height + 2],
      [-2, height + 2],
    ],
    blankSizeCm: blank(width, height),
  };
}

function doorWrapping(door, wrapIn = 15) {
  const doorW = door.L + 2 * 2;
  const wall = door.H + wrapIn;
  const height = door.W + 2 * wrapIn;
  const width = doorW + wall;
  const side = door.side;
  const doorX = side === 'left' ? 0 : wall;
  const wallX = side === 'left' ? doorW : 0;

  return {
    kind: door.kind + '_wrap',
    material: 'wrapping',
    label: side === 'left' ? 'Left door wrapping paper' : 'Right door wrapping paper',
    side,
    L: doorW,
    W: door.W,
    H: wall,
    T: door.T,
    width,
    height,
    panels: {
      door: { x: doorX, y: wrapIn, w: doorW, h: door.W, role: 'door' },
      wall: { x: wallX, y: wrapIn, w: wall, h: door.W, role: 'wall' },
    },
    cut: [
      [0, 0],
      [width, 0],
      [width, height],
      [0, height],
    ],
    creases: [
      { x1: side === 'left' ? doorW : wall, y1: wrapIn, x2: side === 'left' ? doorW : wall, y2: wrapIn + door.W },
      { x1: doorX, y1: wrapIn, x2: doorX + doorW, y2: wrapIn },
      { x1: doorX, y1: wrapIn + door.W, x2: doorX + doorW, y2: wrapIn + door.W },
    ],
    bleed: [
      [-3, -3],
      [width + 3, -3],
      [width + 3, height + 3],
      [-3, height + 3],
    ],
    blankSizeCm: blank(width, height),
  };
}

/** Connection paper — dải bản lề / giấy nối cánh */
function connectionPaper({ W, T, side }) {
  const stripW = r2(18 + T * 2);
  const stripH = r2(W + 10);
  return {
    kind: `connection_${side}`,
    material: 'connection',
    label: side === 'left' ? 'Left - Connection paper' : 'Right - Connection paper',
    side,
    L: stripW,
    W: stripH,
    H: 0,
    T,
    width: stripW,
    height: stripH,
    panels: { strip: { x: 0, y: 0, w: stripW, h: stripH, role: 'connection' } },
    cut: [
      [0, 0],
      [stripW, 0],
      [stripW, stripH],
      [0, stripH],
    ],
    creases: [{ x1: stripW / 2, y1: 0, x2: stripW / 2, y2: stripH }],
    bleed: [
      [-2, -2],
      [stripW + 2, -2],
      [stripW + 2, stripH + 2],
      [-2, stripH + 2],
    ],
    blankSizeCm: blank(stripW, stripH),
  };
}

/**
 * @param {{ L:number, W:number, H:number, T:number }} dims mm (inner)
 */
export function buildPacdoraStyleDoubleDoor(dims) {
  const L = r2(dims.L);
  const W = r2(dims.W);
  const H = r2(dims.H);
  const T = r2(dims.T || 1.5);

  // Interior tray (khay trong)
  const interiorBoard = hardboardTray({
    L,
    W,
    H,
    T,
    kind: 'int_hardboard',
    label: 'Hard board paper of interior box',
  });
  const interiorWrap = wrappingForTray(interiorBoard, 16);
  interiorWrap.label = 'Wrapping paper of interior box';

  // Exterior shell hơi lớn hơn để lồng khay trong
  const gap = T * 2 + 1;
  const eL = r2(L + gap);
  const eW = r2(W + gap);
  const eH = r2(H + T);

  const exteriorBoard = hardboardTray({
    L: eL,
    W: eW,
    H: eH,
    T,
    kind: 'ext_hardboard',
    label: 'Hard board paper of exterior box',
  });
  const exteriorWrap = wrappingForTray(exteriorBoard, 18);
  exteriorWrap.label = 'Wrapping paper of exterior box';

  const extBottom = exteriorBottomBoard({ L: eL + 2 * T, W: eW + 2 * T, T });
  const leftDoor = doorHardboard({ L: eL, W: eW, H: eH, T, side: 'left' });
  const rightDoor = doorHardboard({ L: eL, W: eW, H: eH, T, side: 'right' });
  const leftDoorWrap = doorWrapping(leftDoor, 14);
  const rightDoorWrap = doorWrapping(rightDoor, 14);
  const leftConn = connectionPaper({ W: eW, T, side: 'left' });
  const rightConn = connectionPaper({ W: eW, T, side: 'right' });

  const parts = [
    interiorBoard,
    interiorWrap,
    exteriorBoard,
    exteriorWrap,
    extBottom,
    leftDoor,
    rightDoor,
    leftDoorWrap,
    rightDoorWrap,
    leftConn,
    rightConn,
  ];

  return {
    kind: 'double_door',
    family: 'double_door',
    style: 'pacdora',
    L,
    W,
    H,
    T,
    eL,
    eW,
    eH,
    // legacy fields for 3D
    base: interiorBoard,
    leftDoor,
    rightDoor,
    parts,
  };
}
