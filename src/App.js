import React, { useState, useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  LayersControl,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import Papa from "papaparse";
import * as XLSX from "xlsx";

// LayersControl에서 BaseLayer 컴포넌트만 추출
const { BaseLayer } = LayersControl;

// 마커용 컬러별 아이콘 URL 모음
const iconUrls = {
  red:    "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png",
  blue:   "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png",
  green:  "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png",
  yellow: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-yellow.png",
  orange: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-orange.png",
  violet: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-violet.png",
  grey:   "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-grey.png",
};

// 대분류별 표시할 색상 코드
const colorCodes = {
  red:    "#FF0000",
  blue:   "#0000FF",
  green:  "#008000",
  yellow: "#FFD700",
  orange: "#FFA500",
  violet: "#EE82EE",
  grey:   "#808080",
};

// 가나다순으로 정렬된 대분류 목록
const majorCats = [
  "상수",
  "오수",
  "우수",
  "지반",
  "타 지하시설물",
  "하수",
  "맨홀",
];

// 대분류 ↔ 마커 색 매핑
const majorColorMap = {
  "타 지하시설물": "red",
  상수:            "grey",
  하수:            "blue",
  오수:            "green",
  우수:            "yellow",
  지반:            "orange",
  맨홀:            "violet",
  기타:            "grey",
};

// iconUrls에서 L.Icon 객체를 생성하여 icons에 저장 (그림자 제거)
const icons = {};
Object.entries(iconUrls).forEach(([name, url]) => {
  icons[name] = new L.Icon({
    iconUrl:    url,
    iconSize:   [12, 20],
    iconAnchor: [5, 20],
    popupAnchor:[1, -20],
    // shadowUrl와 shadowSize 옵션을 제거하여 그림자 안 보이게 함
  });
});

export default function App() {
  const [allData, setAllData]                     = useState([]);
  const [selectedRegion1, setSelectedRegion1]     = useState("");
  const [selectedRegion2, setSelectedRegion2]     = useState("");
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [expandedMajors, setExpandedMajors]       = useState([]);
  const [startDate, setStartDate]                 = useState("");
  const [endDate, setEndDate]                     = useState("");
  const [searchText, setSearchText]               = useState("");
  const [selectedMarker, setSelectedMarker]       = useState(null);

  useEffect(() => {
    fetch(process.env.PUBLIC_URL + "/subsidence.csv")
      .then(res => res.text())
      .then(csv => {
        const { data } = Papa.parse(csv, {
          header: true,
          skipEmptyLines: true
        });
        setAllData(data);
      });
  }, []);

  // 주소에서 시/도, 구/군 추출
  const withRegions = allData.map(d => {
    const parts = d.address.split(" ");
    return {
      ...d,
      region1: parts[0] || "",
      region2: parts[1] || ""
    };
  });

  // 지역 필터 옵션 리스트
  const region1List = Array.from(
    new Set(withRegions.map(d => d.region1).filter(r => r))
  ).sort();
  const region2List = selectedRegion1
    ? Array.from(
        new Set(
          withRegions
            .filter(d => d.region1 === selectedRegion1)
            .map(d => d.region2)
            .filter(r => r)
        )
      ).sort()
    : [];

  const categoryList = Array.from(
    new Set(allData.map(d => d.category).filter(c => c && c.trim()))
  ).sort((a, b) => a.localeCompare(b, "ko"));

  const grouped = {}, others = [];
  categoryList.forEach(cat => {
    const major = majorCats.find(mc => cat.startsWith(mc));
    if (major) {
      (grouped[major] = grouped[major] || []).push(cat);
    } else {
      others.push(cat);
    }
  });

  // 각종 필터 적용
  const filteredData = withRegions
    .filter(m => !selectedRegion1 || m.region1 === selectedRegion1)
    .filter(m => !selectedRegion2 || m.region2 === selectedRegion2)
    .filter(m => !startDate || m.date >= startDate)
    .filter(m => !endDate   || m.date <= endDate)
    .filter(m => !searchText ||
      searchText.split(",").map(t => t.trim()).some(t => m.category.includes(t))
    )
    .filter(m =>
      selectedCategories.length === 0 ||
      selectedCategories.includes(m.category)
    )
    .filter(m => m.latitude && m.longitude);

  const toggleMajor = mc => {
    setExpandedMajors(prev =>
      prev.includes(mc) ? prev.filter(x => x !== mc) : [...prev, mc]
    );
  };
  const toggleCategory = cat => {
    setSelectedCategories(prev =>
      prev.includes(cat) ? prev.filter(x => x !== cat) : [...prev, cat]
    );
  };
  const resetFilters = () => {
    setSelectedRegion1("");
    setSelectedRegion2("");
    setSelectedCategories([]);
    setExpandedMajors([]);
    setStartDate("");
    setEndDate("");
    setSearchText("");
    setSelectedMarker(null);
  };

  const downloadCSV = () => {
    const headers = ["address","latitude","longitude","date","width","length","depth","category"];
    const rows = [
      headers.join(","),
      ...filteredData.map(item =>
        headers.map(h => `"${item[h] || ""}"`).join(",")
      )
    ].join("\n");
    const blob = new Blob([rows], { type: "text/csv" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "SinkholeData.csv";
    link.click();
  };

  const downloadExcel = () => {
    const ws = XLSX.utils.json_to_sheet(filteredData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Data");
    XLSX.writeFile(wb, "SinkholeData.xlsx");
  };

  const getIcon = category => {
    const major = majorCats.find(mc => category.startsWith(mc)) || "기타";
    return icons[majorColorMap[major] || "grey"];
  };

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      {/* 왼쪽: 필터 바 + 지도 */}
      <div style={{ flex:1, display:"flex", flexDirection:"column" }}>
        <div style={{
          padding:10, display:"flex", flexWrap:"wrap",
          gap:8, alignItems:"flex-start"
        }}>
          {/* 지역 필터: 시/도 */}
          <label>
            시/도:
            <select
              value={selectedRegion1}
              onChange={e => {
                setSelectedRegion1(e.target.value);
                setSelectedRegion2("");
              }}
              style={{ marginLeft:4 }}
            >
              <option value="">전체</option>
              {region1List.map((r1,i) => (
                <option key={i} value={r1}>{r1}</option>
              ))}
            </select>
          </label>
          {/* 지역 필터: 구/군 */}
          {selectedRegion1 && (
            <label>
              구/군:
              <select
                value={selectedRegion2}
                onChange={e => setSelectedRegion2(e.target.value)}
                style={{ marginLeft:4 }}
              >
                <option value="">전체</option>
                {region2List.map((r2,i) => (
                  <option key={i} value={r2}>{r2}</option>
                ))}
              </select>
            </label>
          )}
          {/* 날짜 필터 */}
          <label>
            시작일:
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              style={{ marginLeft:4 }}
            />
          </label>
          <label>
            종료일:
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              style={{ marginLeft:4 }}
            />
          </label>
          {/* 분류 필터 */}
          {majorCats.concat("기타").map((mc, i) => {
            const isExpanded = expandedMajors.includes(mc);
            const borderColor = colorCodes[majorColorMap[mc]];
            return (
              <div key={i} style={{ display:"flex", flexDirection:"column", gap:4 }}>
                <button
                  onClick={() => toggleMajor(mc)}
                  style={{
                    borderLeft: `4px solid ${borderColor}`,
                    backgroundColor: isExpanded ? "#f0f0f0" : "#fff",
                    border: "1px solid #ccc",
                    borderRadius:4,
                    padding:"4px 8px"
                  }}
                >
                  {mc}
                </button>
                {isExpanded && (grouped[mc]||others).map((sub, j) => (
                  <button
                    key={j}
                    onClick={() => toggleCategory(sub)}
                    style={{
                      marginLeft:16,
                      backgroundColor: selectedCategories.includes(sub) ? "#007bff" : "#fff",
                      color: selectedCategories.includes(sub) ? "#fff" : "#000",
                      border: "1px solid #ccc",
                      borderRadius:4,
                      padding:"2px 6px",
                      fontSize:"0.85em"
                    }}
                  >
                    {sub}
                  </button>
                ))}
              </div>
            );
          })}
          {/* 텍스트 검색, 리셋, 다운로드 */}
          <label style={{ marginLeft:16 }}>
            검색:
            <input
              type="text"
              placeholder="하수,연약"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              style={{ marginLeft:4 }}
            />
          </label>
          <button onClick={resetFilters}>초기화</button>
          <button onClick={downloadCSV}>CSV</button>
          <button onClick={downloadExcel}>Excel</button>
        </div>

        {/* 지도 */}
        <MapContainer center={[36.5,127.8]} zoom={7} style={{ flex:1, width:"100%" }}>
          <LayersControl position="topright">
            <BaseLayer checked name="OSM">
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution="© OpenStreetMap"
              />
            </BaseLayer>
            <BaseLayer name="ESRI Satellite">
              <TileLayer
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                attribution="© ESRI"
              />
            </BaseLayer>
            <BaseLayer name="Google Map">
              <TileLayer
                url="http://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
                subdomains={["mt0","mt1","mt2","mt3"]}
                attribution="© Google"
              />
            </BaseLayer>
            <BaseLayer name="Google Satellite">
              <TileLayer
                url="http://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}"
                subdomains={["mt0","mt1","mt2","mt3"]}
                attribution="© Google"
              />
            </BaseLayer>
          </LayersControl>

          {filteredData.map((m, i) => (
            <Marker
              key={i}
              position={[parseFloat(m.latitude), parseFloat(m.longitude)]}
              icon={getIcon(m.category)}
              eventHandlers={{ click: () => setSelectedMarker(m) }}
            />
          ))}
        </MapContainer>
      </div>

      {/* 오른쪽 대시보드 */}
      <div style={{
        width:300,
        padding:10,
        borderLeft:"1px solid #ccc",
        background:"#fafafa",
        overflowY:"auto"
      }}>
        {selectedMarker ? (
          <>
            <h3>사고 상세 정보</h3>
            <p><strong>주소:</strong> {selectedMarker.address}</p>
            <p><strong>날짜:</strong> {selectedMarker.date}</p>
            <ul style={{ paddingLeft:16 }}>
              <li>폭: {selectedMarker.width} m</li>
              <li>연장: {selectedMarker.length} m</li>
              <li>깊이: {selectedMarker.depth} m</li>
            </ul>
            <p><strong>분류:</strong> {selectedMarker.category}</p>
          </>
        ) : (
          <>
            <h3>필터 요약</h3>
            <p>총 사고 수: {filteredData.length}</p>
          </>
        )}
      </div>
    </div>
  );
}
