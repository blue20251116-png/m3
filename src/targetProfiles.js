export const TARGET_PROFILES = {
  ja: {
    id: 'ja', label: '🇯🇵 일본', language: 'ja', direction: 'ltr',
    fontFamily: 'Noto Sans JP', musicMarket: 'JP',
    titlePatterns: ['{subject}が美しすぎる','一度は見たい{subject}','ずっと見ていたい{subject}','{subject}に行きたくなる瞬間'],
    moodLines: {
      dreamy:['ただ、この景色を見ていたい','時間が止まればいいのに','こんな夜を忘れたくない'],
      nostalgic:['少しだけ昔を思い出す','なぜか懐かしくなる景色','あの頃に戻れそうな気がする'],
      freedom:['遠くに行きたい夜がある','何も考えずに旅に出たい','ここまで来れば全部忘れられそう'],
      calm:['何もしない時間も悪くない','静かな景色に救われる','今日は少しゆっくりしよう'],
      romantic:['大切な人と見たい景色','こんな夜なら歩き続けたい','言葉はいらない気がする'],
      energetic:['この瞬間だけは止まりたくない','街の光を見ると少し元気になる','まだ帰りたくない夜']
    }
  },
  en: {
    id: 'en', label: '🌎 영어권', language: 'en', direction: 'ltr',
    fontFamily: 'Noto Sans', musicMarket: 'GLOBAL',
    titlePatterns: ['{subject} hits different','A view you need to see once','I could watch {subject} forever','This makes me want to leave everything and travel'],
    moodLines: {
      dreamy:['I could stay here forever','Some views do not feel real','Let the world slow down for a moment'],
      nostalgic:['Some places feel like memories','This takes me back somehow','A view that feels strangely familiar'],
      freedom:['I just want to go somewhere far away','No plans, just go','This is what freedom feels like'],
      calm:['Nothing to do but watch','Quiet places heal differently','Maybe slowing down is enough'],
      romantic:['A view worth sharing with someone','Some nights need no words','I would walk here all night'],
      energetic:['This city never lets you stop','One more night before going home','This is the kind of energy I miss']
    }
  },
  ar: {
    id: 'ar', label: '🇸🇦 아랍권', language: 'ar', direction: 'rtl',
    fontFamily: 'Noto Sans Arabic', musicMarket: 'ARAB',
    titlePatterns: ['جمال {subject} لا يوصف','منظر يستحق أن تراه مرة في حياتك','يمكنني مشاهدة {subject} إلى الأبد','لحظة تجعلك ترغب في السفر'],
    moodLines: {
      dreamy:['أريد فقط أن أبقى أمام هذا المنظر','كأن الزمن توقف هنا','مشهد لا يبدو حقيقياً'],
      nostalgic:['هذا المشهد يعيد ذكريات قديمة','هناك أماكن تشبه الذكريات','شعور غريب بالحنين'],
      freedom:['أريد أن أذهب بعيداً فقط','بلا خطط، فقط رحلة','هكذا تبدو الحرية'],
      calm:['يكفي أن تنظر بصمت','الأماكن الهادئة تمنحنا شيئاً مختلفاً','ربما نحتاج فقط إلى بعض الهدوء'],
      romantic:['منظر أريد مشاركته مع شخص عزيز','بعض الليالي لا تحتاج إلى كلمات','يمكنني المشي هنا طوال الليل'],
      energetic:['طاقة هذه المدينة لا تتوقف','ليلة أخرى قبل العودة','هذا النوع من اللحظات لا يُنسى']
    }
  },
  es: {
    id: 'es', label: '🇪🇸 스페인어권', language: 'es', direction: 'ltr',
    fontFamily: 'Noto Sans', musicMarket: 'LATAM',
    titlePatterns: ['{subject} se ve brutal','Un lugar que tienes que ver al menos una vez','Podría mirar {subject} para siempre','Esto me dio ganas de dejarlo todo y viajar'],
    moodLines: {
      dreamy:['Podría quedarme aquí para siempre','Hay paisajes que parecen irreales','Que el mundo se detenga un momento'],
      nostalgic:['Hay lugares que se sienten como recuerdos','Esto me llevó atrás por un segundo','Un paisaje extrañamente familiar'],
      freedom:['Solo quiero irme lejos','Sin planes, solo viajar','Así se siente la libertad'],
      calm:['No hace falta hacer nada, solo mirar','Los lugares tranquilos curan distinto','Quizá solo necesitamos bajar el ritmo'],
      romantic:['Un lugar para compartir con alguien especial','Hay noches que no necesitan palabras','Caminaría aquí toda la noche'],
      energetic:['Esta ciudad no te deja parar','Una noche más antes de volver','Esta energía pega diferente']
    }
  }
};

export function getTargetProfile(id='ja') { return TARGET_PROFILES[id] || TARGET_PROFILES.ja; }
export function listTargetProfiles() { return Object.values(TARGET_PROFILES).map(({moodLines,titlePatterns,...p})=>p); }
