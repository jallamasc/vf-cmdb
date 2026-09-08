import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Sites from "./pages/Sites";
import Hierarchy from "./pages/Hierarchy";
import RackView from "./pages/RackView";
import PatchPanelView from "./pages/PatchPanelView";
import PowerDeviceView from "./pages/PowerDeviceView";
import PortConfigView from "./pages/PortConfigView";
import PhysicalServers from "./pages/PhysicalServers";
import VirtualMachines from "./pages/VirtualMachines";
import ContainersApps from "./pages/ContainersApps";
import Workstations from "./pages/Workstations";
import Vlans from "./pages/Vlans";
import Subnets from "./pages/Subnets";
import IPAM from "./pages/IPAM";
import IpAssignments from "./pages/IpAssignments";
import NetworkDevices from "./pages/NetworkDevices";
import PortConfig from "./pages/PortConfig";
import Naming from "./pages/Naming";
import ReferenceData from "./pages/ReferenceData";
import EntityTypeBuilder from "./pages/EntityTypeBuilder";
import GenericEntityView from "./pages/GenericEntityView";
import Ansible from "./pages/Ansible";
import Changelog from "./pages/Changelog";
import DeviceDashboard from "./pages/DeviceDashboard";
import CablesViewer from "./pages/CablesViewer";
import SimpleGridPage from "./pages/SimpleGridPage";
import RegionDetail from "./pages/RegionDetail";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="sites" element={<Sites />} />
        <Route path="hierarchy" element={<Hierarchy />} />
        <Route path="racks" element={<RackView />} />
        <Route path="racks-list" element={<SimpleGridPage kind="racks" />} />
        <Route path="patch-panel-view" element={<PatchPanelView />} />
        <Route path="patch-panels" element={<SimpleGridPage kind="patch-panels" />} />
        <Route path="power-device-view" element={<PowerDeviceView />} />
        <Route path="power" element={<SimpleGridPage kind="power" />} />
        <Route path="cables" element={<CablesViewer />} />
        <Route path="physical-servers" element={<PhysicalServers />} />
        <Route path="virtual-machines" element={<VirtualMachines />} />
        <Route path="containers-apps" element={<ContainersApps />} />
        <Route path="workstations" element={<Workstations />} />
        <Route path="vlans" element={<Vlans />} />
        <Route path="subnets" element={<Subnets />} />
        <Route path="ipam" element={<IPAM />} />
        <Route path="ip-assignments" element={<IpAssignments />} />
        <Route path="network-devices" element={<NetworkDevices />} />
        <Route path="port-config-view" element={<PortConfigView />} />
        <Route path="port-config" element={<PortConfig />} />
        <Route path="naming" element={<Naming />} />
        <Route path="reference-data" element={<ReferenceData />} />
        <Route path="entity-types" element={<EntityTypeBuilder />} />
        <Route path="entities/:typeSlug" element={<GenericEntityView />} />
        <Route path="ansible" element={<Ansible />} />
        <Route path="changelog" element={<Changelog />} />
        {/* FEAT-7: single-device dashboard, linked from every device grid. */}
        <Route path="devices/:type/:id" element={<DeviceDashboard />} />
        {/* Naming-convention modifications (item 4): per-region detail page,
            linked from the Regions grid in Naming Conventions. */}
        <Route path="regions/:id" element={<RegionDetail />} />
      </Route>
    </Routes>
  );
}
