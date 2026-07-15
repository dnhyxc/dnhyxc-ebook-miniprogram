/** Edge TTS 默认发音人（与 Web / 后端一致） */
export const DEFAULT_EDGE_TTS_VOICE = "zh-CN-XiaoxiaoNeural";

export type EdgeTtsVoice = {
  id: string;
  nameZh: string;
  nameEn: string;
  gender: "female" | "male";
  locale: string;
};

/** 常用 Edge Neural 发音人（对齐 Web EDGE_TTS_LISTEN_VOICES） */
export const EDGE_TTS_LISTEN_VOICES: readonly EdgeTtsVoice[] = [
  {
    id: "zh-CN-XiaoxiaoNeural",
    nameZh: "晓晓",
    nameEn: "Xiaoxiao",
    gender: "female",
    locale: "zh-CN",
  },
  {
    id: "zh-CN-XiaoyiNeural",
    nameZh: "晓伊",
    nameEn: "Xiaoyi",
    gender: "female",
    locale: "zh-CN",
  },
  {
    id: "zh-CN-YunjianNeural",
    nameZh: "云健",
    nameEn: "Yunjian",
    gender: "male",
    locale: "zh-CN",
  },
  {
    id: "zh-CN-YunxiNeural",
    nameZh: "云希",
    nameEn: "Yunxi",
    gender: "male",
    locale: "zh-CN",
  },
  {
    id: "zh-CN-YunxiaNeural",
    nameZh: "云夏",
    nameEn: "Yunxia",
    gender: "male",
    locale: "zh-CN",
  },
  {
    id: "zh-CN-YunyangNeural",
    nameZh: "云扬",
    nameEn: "Yunyang",
    gender: "male",
    locale: "zh-CN",
  },
  {
    id: "zh-CN-liaoning-XiaobeiNeural",
    nameZh: "晓北（东北）",
    nameEn: "Xiaobei (Northeastern)",
    gender: "female",
    locale: "zh-CN-liaoning",
  },
  {
    id: "zh-CN-shaanxi-XiaoniNeural",
    nameZh: "晓妮（陕西）",
    nameEn: "Xiaoni (Shaanxi)",
    gender: "female",
    locale: "zh-CN-shaanxi",
  },
  {
    id: "zh-HK-HiuGaaiNeural",
    nameZh: "晓佳（粤语）",
    nameEn: "HiuGaai (Cantonese)",
    gender: "female",
    locale: "zh-HK",
  },
  {
    id: "zh-HK-HiuMaanNeural",
    nameZh: "晓曼（香港）",
    nameEn: "HiuMaan (Hong Kong)",
    gender: "female",
    locale: "zh-HK",
  },
  {
    id: "zh-HK-WanLungNeural",
    nameZh: "云龙（香港）",
    nameEn: "WanLung (Hong Kong)",
    gender: "male",
    locale: "zh-HK",
  },
  {
    id: "zh-TW-HsiaoChenNeural",
    nameZh: "晓臻（台湾）",
    nameEn: "HsiaoChen (Taiwan)",
    gender: "female",
    locale: "zh-TW",
  },
  {
    id: "zh-TW-YunJheNeural",
    nameZh: "云哲（台湾）",
    nameEn: "YunJhe (Taiwan)",
    gender: "male",
    locale: "zh-TW",
  },
  {
    id: "zh-TW-HsiaoYuNeural",
    nameZh: "晓雨（台湾）",
    nameEn: "HsiaoYu (Taiwan)",
    gender: "female",
    locale: "zh-TW",
  },
  {
    id: "en-US-EmmaMultilingualNeural",
    nameZh: "Emma",
    nameEn: "Emma",
    gender: "female",
    locale: "en-US",
  },
  {
    id: "en-US-BrianMultilingualNeural",
    nameZh: "Brian",
    nameEn: "Brian",
    gender: "male",
    locale: "en-US",
  },
];

export function isEdgeTtsVoiceId(id: string): boolean {
  return EDGE_TTS_LISTEN_VOICES.some((v) => v.id === id);
}

export function getEdgeTtsVoiceNameZh(id: string): string {
  return EDGE_TTS_LISTEN_VOICES.find((v) => v.id === id)?.nameZh ?? id;
}
