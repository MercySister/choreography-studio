export const ATOMS = {
  "version": "0.4.0",
  "source": "产品定义（原子层数据）；俯仰方向按产品v0.3.0决定改为前倾点头（去掉朝天）；氛围灯为新增提案",
  "registryNotes": [
    "自由度：Yaw旋转±180°（0°正前方，±180°背对前方）、Pitch俯仰-30°(低头)~+30°(抬头)、Roll歪头±20°。",
    "俯仰方向（v0.4.0，产品决定）：0°正前方，向上抬头+30°，向下低头-30°。去掉了原'屏幕朝天(0~95°)'能力。前倾/后仰行程以硬件实测为准。",
    "升降自由度已取消（无对应硬件）。",
    "ambientLightAtoms 是新增提案，产品形态上氛围灯是底座发光环。",
    ""
  ],
  "dof": [
    {
      "id": "DOF_YAW",
      "name": "旋转",
      "definition": "头部左右转向（Yaw），斜齿轮执行器+弹簧消隙",
      "range": {
        "min": -180,
        "max": 180,
        "unit": "°",
        "note": "0°=正前方(正对用户)，+左转/-右转，±180°=背对前方（正后方）"
      },
      "precision": {
        "value": 1,
        "unit": "°"
      },
      "stepSize": {
        "value": 5,
        "unit": "°"
      },
      "speedRange": {
        "min": 0,
        "max": 200,
        "unit": "°/s，待实测标定"
      },
      "deadZone": {
        "value": 2,
        "unit": "°"
      },
      "meaning": "看向用户、环顾、摇头、转身、背对等"
    },
    {
      "id": "DOF_PITCH",
      "name": "俯仰",
      "definition": "头部前后俯仰（Pitch），蜗轮蜗杆+扭簧，自锁断电保持；轴线在屏下1/3高度",
      "range": {
        "min": -30,
        "max": 30,
        "unit": "°",
        "note": "0°=正前方(正对用户)，+30°=抬头，-30°=低头（产品v0.4.0决定，去掉朝天）"
      },
      "precision": {
        "value": 1,
        "unit": "°"
      },
      "stepSize": {
        "value": 5,
        "unit": "°"
      },
      "speedRange": {
        "min": 0,
        "max": 120,
        "unit": "°/s，待实测标定"
      },
      "deadZone": {
        "value": 2,
        "unit": "°"
      },
      "meaning": "抬头、低头、点头、前倾、鞠躬、困倦等"
    },
    {
      "id": "DOF_ROLL",
      "name": "歪头",
      "definition": "头部左右歪头（Roll），屏后微型蜗轮模组，轴心在屏面中心",
      "range": {
        "min": -20,
        "max": 20,
        "unit": "°",
        "note": "±20°，结构方案"
      },
      "precision": {
        "value": 1,
        "unit": "°"
      },
      "stepSize": {
        "value": 2,
        "unit": "°"
      },
      "speedRange": {
        "min": 0,
        "max": 90,
        "unit": "°/s，待实测标定"
      },
      "deadZone": {
        "value": 1,
        "unit": "°"
      },
      "meaning": "调皮、卖萌、好奇、跟随音乐摇摆等"
    }
  ],
  "coefficients": {
    "rate": {
      "name": "速率系数",
      "default": 1.0,
      "min": 0.1,
      "max": 100.0,
      "affects": "速度"
    },
    "amplitude": {
      "name": "幅度系数",
      "default": 1.0,
      "min": 0.1,
      "max": 100.0,
      "affects": "高度、角度"
    },
    "repeat": {
      "name": "重复系数",
      "default": 1,
      "min": 1,
      "max": 100,
      "affects": "循环次数"
    },
    "dwell": {
      "name": "停留系数",
      "default": 1.0,
      "min": 0.1,
      "max": 100.0,
      "affects": "停留时长"
    }
  },
  "motionAtoms": [
    {
      "id": "ACT_YAW_LEFT",
      "layer": "L1",
      "name": "左转",
      "dof": [
        "DOF_YAW"
      ],
      "definition": "头部向左转向",
      "range": {
        "min": 0,
        "max": 180,
        "unit": "°"
      },
      "endStrategy": "hold_or_return",
      "meaning": "左看、寻找",
      "defaultParams": {
        "angle": 45
      }
    },
    {
      "id": "ACT_YAW_RIGHT",
      "layer": "L1",
      "name": "右转",
      "dof": [
        "DOF_YAW"
      ],
      "definition": "头部向右转向",
      "range": {
        "min": -180,
        "max": 0,
        "unit": "°"
      },
      "endStrategy": "hold_or_return",
      "meaning": "右看、寻找",
      "defaultParams": {
        "angle": -45
      }
    },
    {
      "id": "ACT_PITCH_HOME",
      "layer": "L1",
      "name": "回正",
      "dof": [
        "DOF_PITCH"
      ],
      "definition": "头部俯仰回到正前方0°",
      "endStrategy": "hold",
      "meaning": "回正、平视",
      "defaultParams": {
        "angle": 0
      }
    },
    {
      "id": "ACT_ROLL_LEFT",
      "layer": "L1",
      "name": "左歪头",
      "dof": [
        "DOF_ROLL"
      ],
      "definition": "头部向左歪",
      "range": {
        "min": 0,
        "max": 20,
        "unit": "°"
      },
      "endStrategy": "return",
      "meaning": "好奇、调皮",
      "defaultParams": {
        "angle": 15
      }
    },
    {
      "id": "ACT_ROLL_RIGHT",
      "layer": "L1",
      "name": "右歪头",
      "dof": [
        "DOF_ROLL"
      ],
      "definition": "头部向右歪",
      "range": {
        "min": -20,
        "max": 0,
        "unit": "°"
      },
      "endStrategy": "return",
      "meaning": "好奇、调皮",
      "defaultParams": {
        "angle": -15
      }
    },
    {
      "id": "ACT_SAFE",
      "layer": "L2",
      "name": "收纳位",
      "dof": [
        "DOF_YAW",
        "DOF_PITCH",
        "DOF_ROLL"
      ],
      "definition": "收纳/睡眠位：头部低头下垂（-30°）",
      "defaultParams": {
        "yaw": 0,
        "pitch": -30,
        "roll": 0
      },
      "endStrategy": "hold",
      "meaning": "睡眠、离线、自身保护、异常、隐私"
    },
    {
      "id": "ACT_IDLE",
      "layer": "L2",
      "name": "默认位",
      "dof": [
        "DOF_YAW",
        "DOF_PITCH",
        "DOF_ROLL"
      ],
      "definition": "头部竖直、正面朝向车内的回正位置",
      "defaultParams": {
        "yaw": 0,
        "pitch": 0,
        "roll": 0
      },
      "endStrategy": "hold",
      "meaning": "机器人默认态、任意动作结束后回正"
    },
    {
      "id": "ACT_TURN_DRIVER",
      "layer": "L2",
      "name": "转向主驾",
      "dof": [
        "DOF_YAW"
      ],
      "definition": "转向面朝主驾方向",
      "defaultParams": {
        "angle": 30,
        "speedDegPerSec": 30,
        "dwellMs": 1000
      },
      "endStrategy": "hold_until_scene_end",
      "meaning": "看见用户、回应主驾"
    },
    {
      "id": "ACT_TURN_PASSENGER",
      "layer": "L2",
      "name": "转向副驾",
      "dof": [
        "DOF_YAW"
      ],
      "definition": "转向面朝副驾方向",
      "defaultParams": {
        "angle": -30,
        "speedDegPerSec": 30,
        "dwellMs": 1000
      },
      "endStrategy": "hold_until_scene_end",
      "meaning": "回应副驾"
    },
    {
      "id": "ACT_TURN_BACK",
      "layer": "L2",
      "name": "转向背后",
      "dof": [
        "DOF_YAW"
      ],
      "definition": "转向正后方（背对用户，看窗外）",
      "defaultParams": {
        "angle": 180,
        "speedDegPerSec": 180,
        "dwellMs": 1000
      },
      "endStrategy": "hold_until_scene_end",
      "meaning": "看窗外、背对"
    },
    {
      "id": "ACT_AROUND",
      "layer": "L2",
      "name": "环顾四周",
      "dof": [
        "DOF_YAW"
      ],
      "definition": "左看右看然后回到中间",
      "defaultParams": {
        "path": [
          0,
          45,
          -45,
          0
        ],
        "speedDegPerSec": 30,
        "dwellMs": 1000
      },
      "endStrategy": "return",
      "meaning": "探索、感知环境"
    },
    {
      "id": "ACT_NOD",
      "layer": "L2",
      "name": "点头",
      "dof": [
        "DOF_PITCH"
      ],
      "definition": "头部向下点头(低头方向)再回正，模拟点头",
      "defaultParams": {
        "path": [
          0,
          -15,
          0
        ],
        "repeat": 1,
        "speedDegPerSec": 90,
        "dwellMs": 250
      },
      "endStrategy": "return",
      "meaning": "确认、收到、同意、打拍子"
    },
    {
      "id": "ACT_DOWN",
      "layer": "L2",
      "name": "低头",
      "dof": [
        "DOF_PITCH"
      ],
      "definition": "头部向下低头（-30°），用于鞠躬/困倦/失落",
      "defaultParams": {
        "angle": -30,
        "speedDegPerSec": 45,
        "dwellMs": 1000
      },
      "endStrategy": "hold_until_scene_end",
      "meaning": "鞠躬、低头、困倦、失落"
    },
    {
      "id": "ACT_UP",
      "layer": "L2",
      "name": "抬头",
      "dof": [
        "DOF_PITCH"
      ],
      "definition": "头部向上抬头（+30°），望向上方",
      "defaultParams": {
        "angle": 30,
        "speedDegPerSec": 45,
        "dwellMs": 1000
      },
      "endStrategy": "hold_until_scene_end",
      "meaning": "抬头、望上、好奇、精神"
    },
    {
      "id": "ACT_SHAKE",
      "layer": "L2",
      "name": "摇头",
      "dof": [
        "DOF_YAW"
      ],
      "definition": "左右摆动后回中",
      "defaultParams": {
        "path": [
          0,
          20,
          -20,
          0
        ],
        "repeat": 1,
        "speedDegPerSec": 60,
        "dwellMs": 300
      },
      "endStrategy": "return",
      "meaning": "否定、不知道、拒绝、调皮"
    },
    {
      "id": "ACT_TILT",
      "layer": "L2",
      "name": "歪头逗趣",
      "dof": [
        "DOF_ROLL"
      ],
      "definition": "左右歪头再回正",
      "defaultParams": {
        "path": [
          0,
          15,
          -15,
          0
        ],
        "repeat": 1,
        "speedDegPerSec": 45,
        "dwellMs": 400
      },
      "endStrategy": "return",
      "meaning": "卖萌、好奇、律动摇摆",
      "status": "proposed"
    }
  ],
  "faceAtoms": [
    {
      "id": "FACE_NORMAL",
      "category": "中性",
      "name": "常态"
    },
    {
      "id": "FACE_SURPRISE",
      "category": "中性",
      "name": "惊讶"
    },
    {
      "id": "FACE_CONFUSE",
      "category": "中性",
      "name": "困惑"
    },
    {
      "id": "FACE_CLOSE",
      "category": "中性",
      "name": "闭眼"
    },
    {
      "id": "FACE_SLEEPY",
      "category": "中性",
      "name": "困倦"
    },
    {
      "id": "FACE_DIZZY",
      "category": "中性",
      "name": "眩晕"
    },
    {
      "id": "FACE_THINK",
      "category": "中性",
      "name": "思考"
    },
    {
      "id": "FACE_SERIOUS",
      "category": "中性",
      "name": "认真"
    },
    {
      "id": "FACE_LEFT",
      "category": "中性",
      "name": "左看"
    },
    {
      "id": "FACE_RIGHT",
      "category": "中性",
      "name": "右看"
    },
    {
      "id": "FACE_HAPPY",
      "category": "正向",
      "name": "开心"
    },
    {
      "id": "FACE_SHY",
      "category": "正向",
      "name": "害羞"
    },
    {
      "id": "FACE_EAGER",
      "category": "正向",
      "name": "期待"
    },
    {
      "id": "FACE_WINK",
      "category": "正向",
      "name": "眨眼"
    },
    {
      "id": "FACE_LIKE",
      "category": "正向",
      "name": "喜欢"
    },
    {
      "id": "FACE_SAD",
      "category": "负向",
      "name": "难过"
    },
    {
      "id": "FACE_ANGRY",
      "category": "负向",
      "name": "生气"
    },
    {
      "id": "FACE_NERVOUS",
      "category": "负向",
      "name": "紧张"
    },
    {
      "id": "FACE_SILENT",
      "category": "负向",
      "name": "无语"
    },
    {
      "id": "FACE_CRY",
      "category": "负向",
      "name": "哭泣"
    }
  ],
  "dressAtoms": [
    {
      "id": "DRESS_MIC",
      "category": "手持类",
      "name": "话筒"
    },
    {
      "id": "DRESS_GUITAR",
      "category": "手持类",
      "name": "木吉他"
    },
    {
      "id": "DRESS_BASS",
      "category": "手持类",
      "name": "电贝斯"
    },
    {
      "id": "DRESS_BATON",
      "category": "手持类",
      "name": "指挥棒"
    },
    {
      "id": "DRESS_SAX",
      "category": "手持类",
      "name": "萨克斯"
    },
    {
      "id": "DRESS_DJ",
      "category": "手持类",
      "name": "打碟机"
    },
    {
      "id": "DRESS_FLAG",
      "category": "手持类",
      "name": "小旗子"
    },
    {
      "id": "DRESS_BALLOON",
      "category": "手持类",
      "name": "气球"
    },
    {
      "id": "DRESS_PHONE",
      "category": "手持类",
      "name": "手机"
    },
    {
      "id": "DRESS_UMBRELLA",
      "category": "手持类",
      "name": "伞"
    },
    {
      "id": "DRESS_FLOWERS",
      "category": "手持类",
      "name": "花束"
    },
    {
      "id": "DRESS_BOOK",
      "category": "手持类",
      "name": "书"
    },
    {
      "id": "DRESS_CAMERA",
      "category": "手持类",
      "name": "相机"
    },
    {
      "id": "DRESS_STEER",
      "category": "手持类",
      "name": "方向盘"
    },
    {
      "id": "DRESS_ENERGY",
      "category": "手持类",
      "name": "能量球"
    },
    {
      "id": "DRESS_MAP",
      "category": "手持类",
      "name": "地图"
    },
    {
      "id": "DRESS_HANDSUP",
      "category": "互动类",
      "name": "举手"
    },
    {
      "id": "DRESS_REDFLOWER",
      "category": "互动类",
      "name": "小红花"
    },
    {
      "id": "DRESS_AGREE",
      "category": "互动类",
      "name": "点赞"
    },
    {
      "id": "DRESS_HEART",
      "category": "互动类",
      "name": "比心"
    },
    {
      "id": "DRESS_CLAP",
      "category": "互动类",
      "name": "拍手"
    },
    {
      "id": "DRESS_HIGHFIVE",
      "category": "互动类",
      "name": "击掌"
    },
    {
      "id": "DRESS_SIX",
      "category": "互动类",
      "name": "666"
    },
    {
      "id": "DRESS_MEDAL",
      "category": "互动类",
      "name": "奖牌"
    },
    {
      "id": "DRESS_LUCKYMONEY",
      "category": "互动类",
      "name": "红包"
    },
    {
      "id": "DRESS_COVEREYES",
      "category": "互动类",
      "name": "捂眼"
    },
    {
      "id": "DRESS_YEAH",
      "category": "互动类",
      "name": "比耶"
    },
    {
      "id": "DRESS_LISTEN",
      "category": "互动类",
      "name": "倾听",
      "note": "原文写作 Dress_Listen，已规范化大小写"
    },
    {
      "id": "DRESS_LOLLIPOP",
      "category": "食物类",
      "name": "棒棒糖"
    },
    {
      "id": "DRESS_MELON",
      "category": "食物类",
      "name": "西瓜"
    },
    {
      "id": "DRESS_CAKE",
      "category": "食物类",
      "name": "生日蛋糕"
    },
    {
      "id": "DRESS_ICECREAM",
      "category": "食物类",
      "name": "冰淇淋"
    },
    {
      "id": "DRESS_TEA",
      "category": "食物类",
      "name": "茶"
    },
    {
      "id": "DRESS_MILKTEA",
      "category": "食物类",
      "name": "奶茶"
    },
    {
      "id": "DRESS_COFFEE",
      "category": "食物类",
      "name": "咖啡"
    },
    {
      "id": "DRESS_TANGHULU",
      "category": "食物类",
      "name": "糖葫芦"
    },
    {
      "id": "DRESS_SUNGLASSES",
      "category": "穿戴类",
      "name": "墨镜"
    },
    {
      "id": "DRESS_NECKTIE",
      "category": "穿戴类",
      "name": "领结"
    },
    {
      "id": "DRESS_GOLDCHAIN",
      "category": "穿戴类",
      "name": "金链子"
    },
    {
      "id": "DRESS_SCARF",
      "category": "穿戴类",
      "name": "围巾"
    }
  ],
  "vibeAtoms": [
    {
      "id": "VIBE_LIGHTNING",
      "name": "闪电"
    },
    {
      "id": "VIBE_SUN",
      "name": "太阳"
    },
    {
      "id": "VIBE_CLOUD",
      "name": "云朵"
    },
    {
      "id": "VIBE_STAR",
      "name": "星光"
    },
    {
      "id": "VIBE_SNOW",
      "name": "雪花"
    },
    {
      "id": "VIBE_RAIN",
      "name": "雨滴"
    },
    {
      "id": "VIBE_WIND",
      "name": "刮风"
    },
    {
      "id": "VIBE_FIREWORK",
      "name": "烟花"
    },
    {
      "id": "VIBE_STREAMER",
      "name": "彩带"
    },
    {
      "id": "VIBE_BUTTERFLY",
      "name": "蝴蝶"
    },
    {
      "id": "VIBE_RAINBOW",
      "name": "彩虹"
    }
  ],
  "ambientLightAtoms": [
    {
      "id": "LIGHT_BREATHE",
      "name": "呼吸",
      "status": "proposed",
      "params": {
        "color": "string(hex)",
        "minBrightness": "0-100",
        "maxBrightness": "0-100",
        "periodMs": "number"
      }
    },
    {
      "id": "LIGHT_GRADIENT",
      "name": "渐变",
      "status": "proposed",
      "params": {
        "colorFrom": "string(hex)",
        "colorTo": "string(hex)",
        "durationMs": "number"
      }
    },
    {
      "id": "LIGHT_SOLID",
      "name": "常亮",
      "status": "proposed",
      "params": {
        "color": "string(hex)",
        "brightness": "0-100"
      }
    },
    {
      "id": "LIGHT_STROBE",
      "name": "频闪",
      "status": "proposed",
      "params": {
        "color": "string(hex)",
        "brightness": "0-100",
        "intervalMs": "number"
      }
    },
    {
      "id": "LIGHT_SWEEP",
      "name": "扫入",
      "status": "proposed",
      "params": {
        "color": "string(hex)",
        "durationMs": "number",
        "direction": "ltr|rtl"
      }
    },
    {
      "id": "LIGHT_RIPPLE",
      "name": "涟漪",
      "status": "proposed",
      "params": {
        "color": "string(hex)",
        "periodMs": "number"
      }
    },
    {
      "id": "LIGHT_OFF",
      "name": "熄灭",
      "status": "proposed",
      "params": {}
    }
  ]
};

const TRACK_ATOM_KEY = {
  motion: "motionAtoms",
  face: "faceAtoms",
  dress: "dressAtoms",
  vibe: "vibeAtoms",
  ambientLight: "ambientLightAtoms",
};

export function buildAtomsIndex(atoms = ATOMS) {
  const flat = [];
  for (const key of Object.values(TRACK_ATOM_KEY)) {
    for (const a of atoms[key] || []) flat.push(a);
  }
  const map = new Map(flat.map((a) => [a.id, a]));
  const dofMap = new Map((atoms.dof || []).map((d) => [d.id, d.range]));
  return {
    byId(id) {
      return map.get(id) || null;
    },
    byTrack(trackName) {
      const key = TRACK_ATOM_KEY[trackName];
      return key ? atoms[key] || [] : [];
    },
    // 单轴动作原子的 DOF 范围（用于 UI 计算角度×幅度后的限幅提示）；多轴/未知返回 null
    dofRangeOf(atom) {
      const dof = atom && atom.dof;
      if (!dof || dof.length !== 1) return null;
      const r = dofMap.get(dof[0]);
      return r ? { min: r.min, max: r.max } : null;
    },
  };
}
