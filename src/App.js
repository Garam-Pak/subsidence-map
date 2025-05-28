import React, { useState, useEffect, useMemo } from "react";
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
import './App.css'; // 별도 CSS 파일로 미디어쿼리 처리

const { BaseLayer, Overlay } = LayersControl;

const iconUrls = {
  red:    "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png",
  blue:   "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png",
  green:  "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png",
  yellow: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-yellow.png",
  orange: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-orange.png",
  violet: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-violet.png",
  grey:   "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-grey.png",
};

const majorCats = ["상수", "오수", "우수", "지반", "타 지하시설물", "하수", "맨홀"];
const majorColorMap = {
  "타 지하시설물": "red",
  상수: "grey",
  하수: "blue",
  오수: "green",
  우수: "yellow",
  지반: "orange",
  맨홀: "violet",
  기타: "grey"
};
const colorCodes = {
  red: "#FF0000",
  blue: "#0000FF",
  green: "#008000",
  yellow: "#FFD700",
  orange: "#FFA500",
  violet: "#EE82EE",
  grey: "#808080"
};

export default function App() {
  const [device, setDevice] = useState('desktop');
  useEffect(() => {
    const handleResize = () => {
      const w = window.innerWidth;
      if (w < 600) setDevice('mobile');
      else if (w < 1024) setDevice('tablet');
      else setDevice('desktop');
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const icons = useMemo(() => {
    return Object.entries(iconUrls).reduce((acc, [name, url]) => {
      acc[name] = new L.Icon({
        iconUrl: url,
        iconSize: device === 'mobile' ? [24, 36] : [12, 20],
        iconAnchor: device === 'mobile' ? [12, 36] : [5, 20],
        popupAnchor: [1, -20],
      });
      return acc;
    }, {});
  }, [device]);

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

  useEffect(() => {
    fetch(process.env.PUBLIC_URL + "/subsidence.csv")
      .then(res => res.text())
      .then(csv => {
        const { data } = Papa.parse(csv, { header: true, skipEmptyLines: true });
        setAllData(data);
      });

    fetch(process.env.PUBLIC_URL + "/geo/muni18.topo.json")
      .then(r => r.json())
      .then(topo => setMuniGeo(feature(topo, topo.objects.skorea_municipalities_2018_geo)));
  }, []);

  const muniStyle = () => ({ color: "#0077ff", weight: 2, fillOpacity: 0 });

  const withRegions = allData.map(d => {
    const parts = d.address.split(" ");
    return { ...d, region1: parts[0] || "", region2: parts[1] || "" };
  });

  const region1List = Array.from(new Set(withRegions.map(d => d.region1).filter(r => r))).sort();
  const region2List = selectedRegion1
    ? Array.from(new Set(withRegions.filter(d => d.region1 === selectedRegion1).map(d => d.region2).filter(r => r))).sort()
    : [];
  const categoryList = Array.from(new Set(allData.map(d => d.category).filter(c => c && c.trim()))).sort((a, b) => a.localeCompare(b, 'ko'));

  const grouped = {}, others = [];
  categoryList.forEach(cat => {
    const major = majorCats.find(mc => cat.startsWith(mc));
    major ? (grouped[major] = grouped[major] || []).push(cat) : others.push(cat);
  });

  const filteredData = withRegions
    .filter(m => !selectedRegion1 || m.region1 === selectedRegion1)
    .filter(m => !selectedRegion2 || m.region2 === selectedRegion2)
    .filter(m => !startDate || m.date >= startDate)
    .filter(m => !endDate || m.date <= endDate)
    .filter(m => !searchText || searchText.split(",").map(t => t.trim()).some(t => m.category.includes(t)))
    .filter(m => selectedCategories.length === 0 || selectedCategories.includes(m.category))
    .filter(m => m.latitude && m.longitude);

  const toggleMajor = mc => setExpandedMajors(prev => prev.includes(mc) ? prev.filter(x => x !== mc) : [...prev, mc]);
  const toggleCategory = cat => setSelectedCategories(prev => prev.includes(cat) ? prev.filter(x => x !== cat) : [...prev, cat]);
  const resetFilters = () => {
    setSelectedRegion1(''); setSelectedRegion2(''); setSelectedCategories([]);
    setExpandedMajors([]); setStartDate(''); setEndDate(''); setSearchText(''); setSelectedMarker(null);
  };
  const downloadExcel = () => {
    const ws = XLSX.utils.json_to_sheet(filteredData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data');
    XLSX.writeFile(wb, 'SinkholeData.xlsx');
  };
  const getIcon = category => {
    const major = majorCats.find(mc => category.startsWith(mc)) || '기타';
    return icons[majorColorMap[major] || 'grey'];
  };

  return (
    <div className={`app-container ${device}`}>
      <div className="left-panel">
        <div className="filter-bar">
          <label>시/도:
            <select value={selectedRegion1} onChange={e => { setSelectedRegion1(e.target.value); setSelectedRegion2(''); }}>
              <option value="">전체</option>
              {region1List.map((r, i) => <option key={i} value={r}>{r}</option>)}
            </select>
          </label>
          {selectedRegion1 && (
            <label>구/군:
              <select value={selectedRegion2} onChange={e => setSelectedRegion2(e.target.value)}>
                <option value="">전체</option>
                {region2List.map((r, i) => <option key={i} value={r}>{r}</option>)}
              </select>
            </label>
          )}
          <label>시작일:<input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></label>
          <label>종료일:<input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} /></label>
          {majorCats.concat('기타').map((mc, i) => (
            <div key={i} className="major-group">
              <button onClick={() => toggleMajor(mc)} className={`major-btn ${expandedMajors.includes(mc) ? 'expanded' : ''}`}>{mc}</button>
              {expandedMajors.includes(mc) && (grouped[mc] || others).map((sub, j) => (
                <button key={j} onClick={() => toggleCategory(sub)} className={`sub-btn ${selectedCategories.includes(sub) ? 'selected' : ''}`}>{sub}</button>
              ))}
            </div>
          ))}
          <label className="search-label">검색:<input type="text" placeholder="하수,연약" value={searchText} onChange={e => setSearchText(e.target.value)} /></label>
          <button className="action-btn" onClick={resetFilters}>초기화</button>
          <button className="action-btn" onClick={downloadExcel}>Excel</button>
        </div>

        <MapContainer center={[36.5, 127.8]} zoom={7} className="map-container">
          <LayersControl position="topright" collapsed={device === 'mobile'}>
            <BaseLayer checked name="OSM">
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" />
            </BaseLayer>
            <BaseLayer name="ESRI Satellite">
              <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" attribution="© ESRI" />
            </BaseLayer>
            <BaseLayer name="Google Map">
              <TileLayer url="http://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}" subdomains={["mt0", "mt1", "mt2", "mt3"]} attribution="© Google" />
            </BaseLayer>
            <BaseLayer name="Google Satellite">
              <TileLayer url="http://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}" subdomains={["mt0", "mt1", "mt2", "mt3"]} attribution="© Google" />
            </BaseLayer>
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

      <div className="dashboard-panel">
        {selectedMarker ? (
          <>
            <h3>사고 상세 정보</h3>
            <p><strong>주소:</strong> {selectedMarker.address}</p>
            <p><strong>날짜:</strong> {selectedMarker.date}</p>
            <ul>
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
