/**
 * バス停マッピング定義
 * 内部キー(key)と、API等で使われる実際の表記(stopNames)を紐付ける
 */
export const BUS_STOP_MAP = [
  { key: "ToKokudaiNishi", stopNames: ["国大西"] },
  { key: "ToKokudaiChuo", stopNames: ["国大中央"] },
  { key: "ToKokudaiKita", stopNames: ["国大北"] },    
  { key: "ToKaikan", stopNames: ["大学会館前"] },
  { key: "ToMinamiG", stopNames: ["国大南門"] },
  { key: "ToShindo", stopNames: ["横浜新道", "横浜新道(新道)", "横浜新道(あおば前)"] },
  { key: "ToOkazawacho", stopNames: ["岡沢町"] },
  { key: "ToHijiri", stopNames: ["ひじりが丘"] }, 
  { key: "ToKamadaiNo2", stopNames: ["釜台住宅第2"] },
];