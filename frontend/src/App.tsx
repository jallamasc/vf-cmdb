import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Sites from "./pages/Sites";
import Hierarchy from "./pages/Hierarchy";
import RackView from "./pages/RackView";
import PhysicalServers from "./pages/PhysicalServers";
import VirtualMachines from "./pages/VirtualMachines";
import ContainersApps from "./pages/ContainersApps";
import Workstations from "./pages/Workstations";
import Vlans from "./pages/Vlans";
import Subnets from "./pages/Subnets";
import IpAssignments from "./pages/IpAssignments";
import NetworkDevices from "./pages/NetworkDevices";
import PortConfig from "./pages/PortConfig";
import Naming from "./pages/Naming";
import ReferenceData from "./pages/ReferenceData";
import Ansible from "./pages/Ansible";
import Changelog from "./pages/Changelog";
import SimpleGridPage from "./pages/SimpleGridPage";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="sites" element={<Sites />} />
        <Route path="hierarchy" element={<Hierarchy />} />
        <Route path="racks" element={<RackView />} />
        <Route path="patch-panels" element={<SimpleGridPage kind="patch-panels" />} />
        <Route path="power" element={<SimpleGridPage kind="power" />} />
        <Route path="cables" element={<SimpleGridPage kind="cables" />} />
        <Route path="physical-servers" element={<PhysicalServers />} />
        <Route path="virtual-machines" element={<VirtualMachines />} />
        <Route path="containers-apps" element={<ContainersApps />} />
        <Route path="workstations" element={<Workstations />} />
        <Route path="vlans" element={<Vlans />} />
        <Route path="subnets" element={<Subnets />} />
        <Route path="ip-assignments" element={<IpAssignments />} />
        <Route path="network-devices" element={<NetworkDevices />} />
        <Route path="port-config" element={<PortConfig />} />
        <Route path="naming" element={<Naming />} />
        <Route path="reference-data" element={<ReferenceData />} />
        <Route path="ansible" element={<Ansible />} />
        <Route path="changelog" element={<Changelog />} />
      </Route>
    </Routes>
  );
}
