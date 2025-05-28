// src/App.js
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
import './App.css';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const { BaseLayer, Overlay } = LayersControl;

const getColorFromRate = rate => {
  if (rate >= 80) return "#800026";
  if (rate >= 60) return "#BD0026";
  if (rate >= 40) return "#E31A1C";
  if (rate >= 20) return "#FC4E2A";
  if (rate >= 10) return "#FD8D3C";
  return "#FFEDA0";
};

const iconUrls = {
  red:    "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png",
  blue:   "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png",
  green:  "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png",
  yellow: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-yellow.png",
  orange: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-orange.png",
  violet: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-violet.png",
  grey:   "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-grey.png",
  black:  "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-black.png"
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
  기타: "black"
};

export default function App() {
  const [device, setDevice] = useState('desktop');
  const [agingData, setAgingData] = useState([]);
  const [showAging, setShowAging] = useState(false);
  const [selectedYear, setSelectedYear] = useState('2022');
  const [muniGeo, setMuniGeo] = useState(null);
  const [allData, setAllData] = useState([]);
  const [selectedMarker, setSelectedMarker] = useState(null);
  const [selectedRegion1, setSelectedRegion1] = useState('');
  const [selectedRegion2, setSelectedRegion2] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [searchText, setSearchText] = useState('');
  const [expandedMajors, setExpandedMajors] = useState([]);
  const [selectedCategories, setSelectedCategories] = useState([]);
  
  // 요약/범례 토글
  const [showSummary, setShowSummary] = useState(true);
  const [showLegend, setShowLegend] = useState(true);

  const resetFilters = () => {
    setSelectedRegion1('');
    setSelectedRegion2('');
    setStartDate('');
    setEndDate('');
    setSearchText('');
    setExpandedMajors([]);
    setSelectedCategories([]);
    setShowAging(false);
    setSelectedYear('2022');
    setSelectedMarker(null);
  };

  useEffect(() => {
    const resize = () => {
      const w = window.innerWidth;
      if (w < 600) setDevice('mobile');
      else if (w < 1024) setDevice('tablet');
      else setDevice('desktop');
    };
    window.addEventListener('resize', resize);
    resize();
    return () => window.removeEventListener('resize', resize);
  }, []);

  useEffect(() => {
    Papa.parse(process.env.PUBLIC_URL + '/aging_rate.csv', {
      download: true, header: true, skipEmptyLines: true,
      complete: res => setAgingData(res.data)
    });
    Papa.parse(process.env.PUBLIC_URL + '/subsidence.csv', {
      download: true, header: true, skipEmptyLines: true,
      complete: res => setAllData(res.data)
    });
    fetch(process.env.PUBLIC_URL + '/geo/muni18.topo.json')
      .then(r => r.json())
      .then(topo => setMuniGeo(feature(topo, topo.objects.skorea_municipalities_2018_geo)));
  }, []);

  const muniStyle = feat => {
    if (!showAging) return { color: '#0077ff', weight: 1, fillOpacity: 0 };
    const m = agingData.find(r => feat.properties.name.includes(r.region2));
    return m && m[selectedYear]
      ? { color: '#555', weight: 1, fillOpacity: 0.7, fillColor: getColorFromRate(+m[selectedYear]) }
      : { color: '#0077ff', weight: 1, fillOpacity: 0 };
  };

  const withRegions = allData.map(d => {
    const [r1, r2] = d.address.split(' ');
    return { ...d, region1: r1||'', region2: r2||'' };
  });
  const region1List = [...new Set(withRegions.map(d => d.region1))].filter(Boolean).sort();
  const region2List = selectedRegion1
    ? [...new Set(withRegions.filter(d => d.region1 === selectedRegion1).map(d => d.region2))].filter(Boolean).sort()
    : [];

  const grouped = {};
  const others = [];
  [...new Set(allData.map(d => d.category).filter(Boolean))].sort().forEach(cat => {
    const maj = majorCats.find(m => cat.startsWith(m));
    maj ? (grouped[maj] = grouped[maj]||[]).push(cat) : others.push(cat);
  });

  const filtered = withRegions
    .filter(d => !selectedRegion1 || d.region1 === selectedRegion1)
    .filter(d => !selectedRegion2 || d.region2 === selectedRegion2)
    .filter(d => !startDate || d.date >= startDate)
    .filter(d => !endDate || d.date <= endDate)
    .filter(d => !searchText || searchText.split(',').some(t => d.category.includes(t.trim())))
    .filter(d => !selectedCategories.length || selectedCategories.includes(d.category))
    .filter(d => d.latitude && d.longitude);

  const chartData = useMemo(() => {
    const cnt = {};
    filtered.forEach(d => cnt[d.category] = (cnt[d.category]||0) + 1);
    return Object.entries(cnt).map(([name, value]) => ({ name, value }));
  }, [filtered]);

  const icons = useMemo(() => {
    return Object.entries(iconUrls).reduce((acc, [k, url]) => {
      acc[k] = new L.Icon({
        iconUrl: url,
        iconSize: device==='mobile'? [16,24] : [12,20],
        iconAnchor: device==='mobile'? [8,24] : [5,20],
        popupAnchor: [1,-20]
      });
      return acc;
    }, {});
  }, [device]);

  return (
    <div className={`app-container ${device}`}>
      <div className="left-panel">
        {/* 선택된 카테고리 태그 */}
        {selectedCategories.length > 0 && (
          <div className="selected-tags">
            {selectedCategories.map(cat => (
              <span key={cat} className="tag">
                {cat}
                <button onClick={() => setSelectedCategories(prev => prev.filter(x => x !== cat))}>
                  &times;
                </button>
              </span>
            ))}
            <button className="clear-all" onClick={() => setSelectedCategories([])}>전체 해제</button>
          </div>
        )}

        <div className="filter-bar">
          <button onClick={resetFilters}>초기화</button>
          <label>시/도:
            <select value={selectedRegion1} onChange={e=>{setSelectedRegion1(e.target.value); setSelectedRegion2('');}}>
              <option value="">전체</option>
              {region1List.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          {selectedRegion1 && (
            <label>구/군:
              <select value={selectedRegion2} onChange={e=>setSelectedRegion2(e.target.value)}>
                <option value="">전체</option>
                {region2List.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
          )}
          <label>시작일:<input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)}/></label>
          <label>종료일:<input type="date" value={endDate} onChange={e=>setEndDate(e.target.value)}/></label>
          <label>검색:<input value={searchText} onChange={e=>setSearchText(e.target.value)} placeholder="하수,연약"/></label>
          {[...majorCats,'기타'].map(m => (
            <div key={m} className="major-group">
              <button
                onClick={()=>setExpandedMajors(prev=>prev.includes(m)?prev.filter(x=>x!==m):[...prev,m])}
                className={expandedMajors.includes(m)?'expanded':''}
              >{m}</button>
              {expandedMajors.includes(m) && (grouped[m]||others).map(c=>(
                <button
                  key={c}
                  onClick={()=>setSelectedCategories(prev=>prev.includes(c)?prev.filter(x=>x!==c):[...prev,c])}
                  className={selectedCategories.includes(c)?'selected':''}
                >{c}</button>
              ))}
            </div>
          ))}

          <button onClick={() => {
            const ws = XLSX.utils.json_to_sheet(filtered);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Data');
            XLSX.writeFile(wb,'SinkholeData.xlsx');
          }}>Excel</button>
          <label>
            <input type="checkbox" checked={showAging} onChange={e=>setShowAging(e.target.checked)}/>
             노후화율
          </label>
          {showAging && (
            <label>년도:
              <select value={selectedYear} onChange={e=>setSelectedYear(e.target.value)}>
                {[2022,2021,2020,2019,2018,2017,2016].map(y=>(
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </label>
          )}
        </div>

        <MapContainer center={[36.5,127.8]} zoom={7} className="map-container">
          <LayersControl position="topright" collapsed={device==='mobile'}>
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
            <Overlay checked name="시군구 경계">
              {muniGeo && (
                <GeoJSON
                  data={muniGeo}
                  style={muniStyle}
                  onEachFeature={(f, l) => l.bindTooltip(f.properties.name, { sticky: true })}
                />
              )}
            </Overlay>
          </LayersControl>

          {filtered.map((d,i) => (
            <Marker
              key={i}
              position={[+d.latitude, +d.longitude]}
              icon={icons[majorColorMap[ majorCats.find(m => d.category.startsWith(m)) || '기타' ]]}
              eventHandlers={{ click: () => setSelectedMarker(d) }}
            />
          ))}
        </MapContainer>
      </div>

      <div className="dashboard-panel">
        <div className="dashboard-controls">
          <label style={{ marginRight: 10 }}>
            <input
              type="checkbox"
              checked={showSummary}
              onChange={e => setShowSummary(e.target.checked)}
            /> 요약 표시
          </label>
          <label>
            <input
              type="checkbox"
              checked={showLegend}
              onChange={e => setShowLegend(e.target.checked)}
            /> 범례 표시
          </label>
        </div>

        {showSummary && (
          selectedMarker ? (
            <div>
              <h3>사고 정보</h3>
              <p><strong>주소:</strong> {selectedMarker.address}</p>
              <p><strong>날짜:</strong> {selectedMarker.date}</p>
              <ul>
                <li>폭: {selectedMarker.width}m</li>
                <li>연장: {selectedMarker.length}m</li>
                <li>깊이: {selectedMarker.depth}m</li>
              </ul>
              <p><strong>분류:</strong> {selectedMarker.category}</p>
            </div>
          ) : (
            <div>
              <h3>요약</h3>
              <p>사고 수: {filtered.length}</p>
              {showAging && <p>{selectedYear}년 노후화율 표시中</p>}
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData} layout="vertical">
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" width={80} />
                  <Tooltip />
                  <Bar dataKey="value" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )
        )}

        {showLegend && (
          <div className="legend">
            <h4>범례</h4>
            {Object.entries(majorColorMap).map(([k, v]) => (
              <div key={k}>
                <span
                  style={{
                    background: v,
                    width: 10,
                    height: 10,
                    display: 'inline-block',
                    marginRight: 5
                  }}
                /> {k}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}