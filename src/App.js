import React, { useState, useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  LayersControl,
  GeoJSON
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { feature } from "topojson-client";

// LayersControl에서 BaseLayer와 Overlay 추출
const { BaseLayer, Overlay } = LayersControl;

// 마커용 컬러별 아이콘 URL
const iconUrls = {
  red:    "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png",
  blue:   "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png",
  green:  "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png",
  yellow: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-yellow.png",
  orange: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-orange.png",
  violet: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-violet.png",
  grey:   "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-grey.png",
};

// 대분류별 색상 코드
const colorCodes = {
  red:    "#FF0000",
  blue:   "#0000FF",
  green:  "#008000",
  yellow: "#FFD700",
  orange: "#FFA500",
  violet: "#EE82EE",
  grey:   "#808080",
};

// 대분류 목록
const majorCats = [
  "상수",
  "오수",
  "우수",
  "지반",
  "타 지하시설물",
  "하수",
  "맨홀",
];

// 대분류 ↔ 색 매핑
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

// 아이콘 생성
const icons = {};
Object.entries(iconUrls).forEach(([name, url]) => {
  icons[name] = new L.Icon({
    iconUrl: url,
    iconSize: [12, 20],
    iconAnchor: [5, 20],
    popupAnchor: [1, -20],
  });
});

export default function App() {
  // state 정의
  const [muniGeo, setMuniGeo] = useState(null);
  const [allData, setAllData] = useState([]);
  const [selectedRegion1, setSelectedRegion1] = useState("");
  const [selectedRegion2, setSelectedRegion2] = useState("");
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [expandedMajors, setExpandedMajors] = useState([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [searchText, setSearchText] = useState("");
  const [selectedMarker, setSelectedMarker] = useState(null);

  // 데이터 로드
  useEffect(() => {
    // CSV 로드
    fetch(process.env.PUBLIC_URL + "/subsidence.csv")
      .then(res => res.text())
      .then(csv => {
        const { data } = Papa.parse(csv, { header: true, skipEmptyLines: true });
        setAllData(data);
      });

    // TopoJSON (시군구 경계)
    fetch(process.env.PUBLIC_URL + "/geo/muni18.topo.json")
      .then(r => r.json())
      .then(topo =>
        setMuniGeo(feature(topo, topo.objects.skorea_municipalities_2018_geo))
      );
  }, []);

  const muniStyle = () => ({
    color: "#0077ff",
    weight: 2,
    fillOpacity: 0
  });

  // 지역 정보 추출
  const withRegions = allData.map(d => {
    const parts = d.address.split(" ");
    return { ...d, region1: parts[0] || "", region2: parts[1] || "" };
  });

  // 필터 옵션 생성
  const region1List = Array.from(new Set(withRegions.map(d => d.region1).filter(r => r))).sort();
  const region2List = selectedRegion1
    ? Array.from(new Set(
        withRegions
          .filter(d => d.region1 === selectedRegion1)
          .map(d => d.region2)
          .filter(r => r)
      )).sort()
    : [];
  const categoryList = Array.from(new Set(allData.map(d => d.category).filter(c => c && c.trim())))
    .sort((a, b) => a.localeCompare(b, "ko"));
  const grouped = {};
  const others = [];
  categoryList.forEach(cat => {
    const major = majorCats.find(mc => cat.startsWith(mc));
    if (major) (grouped[major] = grouped[major] || []).push(cat);
    else others.push(cat);
  });

  // 필터링
  const filteredData = withRegions
    .filter(m => !selectedRegion1 || m.region1 === selectedRegion1)
    .filter(m => !selectedRegion2 || m.region2 === selectedRegion2)
    .filter(m => !startDate || m.date >= startDate)
    .filter(m => !endDate || m.date <= endDate)
    .filter(m => !searchText || searchText.split(",").map(t => t.trim()).some(t => m.category.includes(t)))
    .filter(m => selectedCategories.length === 0 || selectedCategories.includes(m.category))
    .filter(m => m.latitude && m.longitude);

  // 이벤트 핸들러
  const toggleMajor = mc => setExpandedMajors(prev => prev.includes(mc) ? prev.filter(x => x !== mc) : [...prev, mc]);
  const toggleCategory = cat => setSelectedCategories(prev => prev.includes(cat) ? prev.filter(x => x !== cat) : [...prev, cat]);
  const resetFilters = () => {
    setSelectedRegion1(""); setSelectedRegion2(""); setSelectedCategories([]);
    setExpandedMajors([]); setStartDate(""); setEndDate(""); setSearchText(""); setSelectedMarker(null);
  };

  // Excel 다운로드
  const downloadExcel = () => {
    const ws = XLSX.utils.json_to_sheet(filteredData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Data");
    XLSX.writeFile(wb, "SinkholeData.xlsx");
  };

  // 아이콘 선택
  const getIcon = category => {
    const major = majorCats.find(mc => category.startsWith(mc)) || "기타";
    return icons[majorColorMap[major] || "grey"];
  };

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      {/* 왼쪽: 필터 + 지도 */}
      <div style={{ flex:1, display:"flex", flexDirection:"column" }}>
        {/* 필터 바 */}
        <div style={{ padding:10, display:"flex", flexWrap:"wrap", gap:8, alignItems:"flex-start" }}>
          {/* 시/도 */}
          <label>시/도:
            <select value={selectedRegion1} onChange={e => {setSelectedRegion1(e.target.value); setSelectedRegion2("");}} style={{marginLeft:4}}>
              <option value="">전체</option>
              {region1List.map((r,i)=><option key={i} value={r}>{r}</option>)}
            </select>
          </label>
          {/* 구/군 */}
          {selectedRegion1 && (
            <label>구/군:
              <select value={selectedRegion2} onChange={e=>setSelectedRegion2(e.target.value)} style={{marginLeft:4}}>
                <option value="">전체</option>
                {region2List.map((r,i)=><option key={i} value={r}>{r}</option>)}
              </select>
            </label>
          )}
          {/* 날짜 */}
          <label>시작일:<input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} style={{marginLeft:4}}/></label>
          <label>종료일:<input type="date" value={endDate} onChange={e=>setEndDate(e.target.value)} style={{marginLeft:4}}/></label>
          {/* 분류 */}
          {majorCats.concat("기타").map((mc,i)=>{
            const isExp = expandedMajors.includes(mc);
            return (
              <div key={i} style={{display:"flex",flexDirection:"column",gap:4}}>
                <button onClick={()=>toggleMajor(mc)}
                  style={{borderLeft:`4px solid ${colorCodes[majorColorMap[mc]]}`,backgroundColor:isExp?"#f0f0f0":"#fff",border:"1px solid #ccc",borderRadius:4,padding:"4px 8px"}}
                >{mc}</button>
                {isExp&&(grouped[mc]||others).map((sub,j)=>
                  <button key={j} onClick={()=>toggleCategory(sub)}
                    style={{
                      marginLeft:16,
                      backgroundColor:selectedCategories.includes(sub)?"#007bff":"#fff",
                      color:selectedCategories.includes(sub)?"#fff":"#000",
                      border:"1px solid #ccc",
                      borderRadius:4,
                      padding:"2px 6px",
                      fontSize:"0.85em"
                    }}
                  >
                    {sub}
                  </button>
                )}
              </div>
            );
          })}
          <label style={{marginLeft:16}}>검색:<input type="text" placeholder="하수,연약" value={searchText} onChange={e=>setSearchText(e.target.value)} style={{marginLeft:4}}/></label>
          <button onClick={resetFilters}>초기화</button>
          <button onClick={downloadExcel}>Excel</button>
        </div>

        {/* 지도 */}
        <MapContainer center={[36.5,127.8]} zoom={7} style={{flex:1,width:"100%"}}>
          <LayersControl position="topright">
            <BaseLayer checked name="OSM">
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap"/>
            </BaseLayer>
            <BaseLayer name="ESRI Satellite">
              <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" attribution="© ESRI"/>
            </BaseLayer>
            <BaseLayer name="Google Map">
              <TileLayer url="http://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}" subdomains={["mt0","mt1","mt2","mt3"]} attribution="© Google"/>
            </BaseLayer>
            <BaseLayer name="Google Satellite">
              <TileLayer url="http://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}" subdomains={["mt0","mt1","mt2","mt3"]} attribution="© Google"/>
            </BaseLayer>

            {/* TopoJSON 기반 시군구 경계 */}
            <Overlay checked name="시군구 경계">
              {muniGeo && (
                <GeoJSON
                  data={muniGeo}
                  style={muniStyle}
                  onEachFeature={(feature, layer) =>
                    layer.bindTooltip(feature.properties.name, { sticky: true })
                  }
                />
              )}
            </Overlay>
          </LayersControl>

          {filteredData.map((m,i)=>
            <Marker
              key={i}
              position={[parseFloat(m.latitude), parseFloat(m.longitude)]}
              icon={getIcon(m.category)}
              eventHandlers={{ click: () => setSelectedMarker(m) }}
            />
          )}
        </MapContainer>
      </div>

      {/* 오른쪽 대시보드 */}
      <div style={{width:300,padding:10,borderLeft:"1px solid #ccc",background:"#fafafa",overflowY:"auto"}}>
        {selectedMarker ? (
          <>
            <h3>사고 상세 정보</h3>
            <p><strong>주소:</strong> {selectedMarker.address}</p>
            <p><strong>날짜:</strong> {selectedMarker.date}</p>
            <ul style={{paddingLeft:16}}>
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
