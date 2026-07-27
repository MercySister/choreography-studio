export const EXAMPLES = {
  "welcome": {
    "id": "combo_welcome_001",
    "name": "迎宾问候",
    "version": "0.1.0",
    "description": "参考产品定义迎宾态设计的简化示例：立起+转向+微笑+暖光扫入（自由度：立起=俯仰回正）",
    "scenePriority": 2,
    "interruptible": true,
    "loop": {
      "enabled": false,
      "count": 1
    },
    "tracks": {
      "motion": [
        {
          "atomId": "ACT_PITCH_HOME",
          "startMs": 0,
          "durationMs": 1000,
          "coefficients": {
            "rate": 1.0,
            "amplitude": 1.0,
            "repeat": 1,
            "dwell": 1.0
          }
        },
        {
          "atomId": "ACT_TURN_DRIVER",
          "startMs": 1000,
          "durationMs": 1200,
          "coefficients": {
            "rate": 1.0,
            "amplitude": 1.0,
            "repeat": 1,
            "dwell": 1.0
          }
        }
      ],
      "face": [
        {
          "atomId": "FACE_EAGER",
          "startMs": 0,
          "durationMs": 1000
        },
        {
          "atomId": "FACE_HAPPY",
          "startMs": 1000,
          "durationMs": 1400
        }
      ],
      "dress": [
        {
          "atomId": "DRESS_HANDSUP",
          "startMs": 1000,
          "durationMs": 1400
        }
      ],
      "vibe": [],
      "ambientLight": [
        {
          "atomId": "LIGHT_SWEEP",
          "startMs": 0,
          "durationMs": 1200,
          "color": "#FFCD8C"
        },
        {
          "atomId": "LIGHT_BREATHE",
          "startMs": 1200,
          "durationMs": 1200,
          "color": "#FFDDAA",
          "brightness": 60
        }
      ]
    }
  },
  "music": {
    "id": "combo_music_pop_001",
    "name": "音乐律动·流行乐",
    "version": "0.1.0",
    "description": "参考产品定义音光派对设计的简化示例：点头节奏+开心表情+话筒配饰+涟漪灯效",
    "scenePriority": 3,
    "interruptible": true,
    "loop": {
      "enabled": true,
      "count": -1
    },
    "tracks": {
      "motion": [
        {
          "atomId": "ACT_NOD",
          "startMs": 0,
          "durationMs": 500,
          "coefficients": {
            "rate": 1.5,
            "amplitude": 1.0,
            "repeat": 1,
            "dwell": 0.5
          }
        }
      ],
      "face": [
        {
          "atomId": "FACE_HAPPY",
          "startMs": 0,
          "durationMs": 2000
        }
      ],
      "dress": [
        {
          "atomId": "DRESS_MIC",
          "startMs": 0,
          "durationMs": 2000
        }
      ],
      "vibe": [],
      "ambientLight": [
        {
          "atomId": "LIGHT_RIPPLE",
          "startMs": 0,
          "durationMs": 2000,
          "color": "#7AC9FF"
        }
      ]
    }
  }
};
