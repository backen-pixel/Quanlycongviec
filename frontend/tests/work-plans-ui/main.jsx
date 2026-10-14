import React from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter,Routes,Route} from 'react-router-dom';
import ProductionPlanPage from '../../src/pages/ProductionPlanPage';
import ProductionPlanTasksPage from '../../src/pages/ProductionPlanTasksPage';
import './style.css';
createRoot(document.getElementById('root')).render(<BrowserRouter><div className="bg-amber-50 p-2">KIỂM THỬ CỤC BỘ — dữ liệu giả, không nối hệ thống đang dùng</div><Routes><Route path="/sx/projects/:id/plan" element={<ProductionPlanPage/>}/><Route path="/sx/plan-tasks" element={<ProductionPlanTasksPage/>}/></Routes></BrowserRouter>);
