import React from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter,Routes,Route} from 'react-router-dom';
import ProductionPlanPage from '../../src/pages/ProductionPlanPage';
import ProductionPlanTasksPage from '../../src/pages/ProductionPlanTasksPage';
import {ProductionPlanBoardProvider,ProductionPlanAutoBoard} from '../../src/components/ProductionPlanBoard';
import './style.css';
const projects=[{id:'00000000-0000-4000-8000-000000000001',name:'Dự án sau'},{id:'00000000-0000-4000-8000-000000000003',name:'Dự án trước'}];
createRoot(document.getElementById('root')).render(<BrowserRouter><div className="bg-amber-50 p-2">KIỂM THỬ CỤC BỘ — dữ liệu giả, không nối hệ thống đang dùng</div><Routes><Route path="/sx/projects/:id/plan" element={<ProductionPlanPage/>}/><Route path="/sx/plan-tasks" element={<ProductionPlanTasksPage/>}/><Route path="/test-board" element={<ProductionPlanBoardProvider projects={projects}><ProductionPlanAutoBoard projects={projects}/></ProductionPlanBoardProvider>}/></Routes></BrowserRouter>);
