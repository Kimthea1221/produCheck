import React, { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { API_BASE_URL } from '../../utils/apiConfig'
import {
  LayoutDashboard, //dashboard icon
  ClipboardList, //complaints menu icon
  ShieldCheck, //verification request menu icon
  RefreshCw, //status update menu icon
  Database, //product database menu icon
  FileText, // view reports menu icon
  CirclePlus, //new walk in intake menu icon
  Bookmark, // saved draft menu icon
  UsersRound, // user management icon
  UserCog, // admin management icon
  ScrollText, // audit logs icon
  MapPin, // workspace location icon
  Menu, // hamburger icon (NEW - responsive sidebar)
} from "lucide-react";


// Images
import CIDGLogo from '../../images/pnp-cidg.jpg'
import FDALogo from '../../images/FDA.png'
import ICMDALogo from '../../images/icmda_logo.png'

const NationalAdminMenuItems = [
    { icon: UserCog, label: 'Interagency Admin Management', path: '/nationaladminfolder/national-admin-interagency-admin-management' },
    { icon: UsersRound, label: 'National Admin Management', path: '/nationaladminfolder/national-admin-new-admin-management' },
    { icon: ScrollText, label: 'Audit Logs', path: '/nationaladminfolder/national-admin-audit-logs' },
]

// Backwards compatibility alias
const SuperAdminMenuItems = NationalAdminMenuItems

const FDAAdminMenuItems = [
    { icon: UsersRound, label: 'User Management', path: '/fdaadminfolder/fda-admin-user-management' },
    { icon: UserCog, label: 'Admin Management', path: '/fdaadminfolder/fda-admin-admin-management' },
    { icon: MapPin, label: 'Workspace Location', path: '/fdaadminfolder/fda-admin-workspace-location' },
    { icon: ScrollText, label: 'Audit Logs', path: '/fdaadminfolder/fda-admin-audit-logs' },
]

const LeaAdminMenuItems = [
    { icon: UsersRound, label: 'User Management', path: '/leaadminfolder/lea-admin-user-management' },
    { icon: UserCog, label: 'Admin Management', path: '/leaadminfolder/lea-admin-admin-management' },
    { icon: MapPin, label: 'Workspace Location', path: '/leaadminfolder/lea-admin-workspace-location' },
    { icon: ScrollText, label: 'Audit Logs', path: '/leaadminfolder/lea-admin-audit-logs' },
]

const FDAMenuItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/fdafolder/fda-dashboard' },
    { icon: FileText, label: 'View Reports', path: '/fdafolder/fda-view-reports' },
    { icon: ShieldCheck, label: 'Verification Queue', path: '/fdafolder/fda-verification' },
    { icon: RefreshCw, label: 'Status Update', path: '/fdafolder/fda-status' },
    { icon: Database, label: 'Product Database', path: '/fdafolder/fda-product-db' },
    {icon: Bookmark, label: 'Saved Drafts', path: '/fdafolder/fda-saved-draft'},
]

const LeaMenuItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/leacidgfolder/lea-dashboard' },
    { icon: CirclePlus, label: 'New Walk-in Intake', path: '/leacidgfolder/lea-new-intake' },
    { icon: ClipboardList, label: 'Walk-in Complaints', path: '/leacidgfolder/lea-walkin-complaints' },
    { icon: ShieldCheck, label: 'Verification Request', path: '/leacidgfolder/lea-verification-request' },
    { icon: Bookmark, label: 'Saved Drafts', path: '/leacidgfolder/lea-saved-draft' },
]

const sidebarStyles = `
/* National Admin / SuperAdmin Sidebar Styles */

.NationalAdminSidebarMain,
.SuperAdminSidebarMain {
  width: 280px;
  height: 100vh;
  background: #1E293B;
  display: flex;
  flex-direction: column;
  position: relative;
  box-sizing: border-box;
}

.NationalAdminSidebarTop,
.SuperAdminSidebarTop {
  width: 280px;
  min-height: 70px;
  height: fit-content;
  display: flex;
  justify-content: center;
  gap: 10px;
  align-items: center;
  padding: 10px;
  color: #fdfdfd;
  font-size: small;
  font-weight: 600;
  border-bottom: 1px solid rgba(253, 253, 253, 0.2);
  box-sizing: border-box;
}

.NationalAdminSidebarTop .SidebarLogoWrapper,
.SuperAdminSidebarTop .SidebarLogoWrapper {
  border-radius: 50%;
  overflow: hidden;
  box-shadow: 0 0 0 1.5px rgba(253, 253, 253, 0.2);
}

.NationalAdminSidebarTop img,
.SuperAdminSidebarTop img,
.FdaAdminSidebarTop img,
.FdaSidebarTop img,
.LeaAdminSidebarTop img,
.LeaSidebarTop img {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  object-fit: cover;
  display: block;
}

.NationalAdminSidebarMenu,
.SuperAdminSidebarMenu {
  display: flex;
  flex-direction: column;
  padding: 12px 8px;
  gap: 4px;
  align-items: center;
  flex: 1;
}

.NationalAdminSidebarMenu .MenuBtn,
.SuperAdminSidebarMenu .MenuBtn {
  width: 100%;
  padding: 12px 16px;
  background: transparent;
  color: #ffffff;
  border: none;
  border-radius: 8px;
  text-align: left;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.2s;
  display: flex;
  align-items: center;
  gap: 10px;
}

.NationalAdminSidebarMenu .MenuBtn:hover,
.SuperAdminSidebarMenu .MenuBtn:hover {
  background: rgba(255, 255, 255, 0.1);
}

.NationalAdminSidebarMenu .MenuBtn.active,
.SuperAdminSidebarMenu .MenuBtn.active {
  background: rgba(255, 255, 255, 0.2);
  font-weight: 600;
}

/* ========================================== */
/* FDA Sidebar Styles                         */
/* ========================================== */
.FdaSidebarMain {
  width: 280px;
  height: 100vh;
  background: #1B4332;
  display: flex;
  flex-direction: column;
  position: relative;
  box-sizing: border-box;
}

.FdaSidebarTop {
  width: 280px;
  min-height: 70px;
  height: fit-content;
  display: flex;
  justify-content: center;
  gap: 10px;
  align-items: center;
  padding: 10px;
  color: #fdfdfd;
  font-size: small;
  border-bottom: 1px solid rgba(253, 253, 253, 0.2);
  box-sizing: border-box;
}

.FdaSidebarTop img {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  object-fit: cover;
  display: block;
}

.FdaSidebarMenu {
  display: flex;
  flex-direction: column;
  padding: 12px 8px;
  gap: 4px;
  align-items: center;
  flex: 1;
}

.FdaMenuBtn {
  width: 100%;
  padding: 12px 16px;
  background: transparent;
  color: #ffffff;
  border: none;
  border-radius: 8px;
  text-align: left;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.2s;
  display: flex;
  align-items: center;
  gap: 10px;
}

.FdaMenuBtn:hover {
  background: rgba(255, 255, 255, 0.1);
}

.FdaMenuBtn.active {
  background: rgba(255, 255, 255, 0.2);
  font-weight: 600;
}

.FdaMenuIcons svg {
  width: 21px;
  height: 21px;
  display: block;
}

/* ========================================== */
/* LEA Sidebar Styles                         */
/* ========================================== */
.LeaSidebarMain {
  width: 250px;
  height: 100vh;
  background: #1a1a2e;
  display: flex;
  flex-direction: column;
  position: relative;
  box-sizing: border-box;
}

.LeaSidebarTop {
  width: 250px;
  min-height: 70px;
  height: fit-content;
  display: flex;
  justify-content: center;
  gap: 10px;
  align-items: center;
  padding: 10px;
  color: #fdfdfd;
  font-size: small;
  border-bottom: 1px solid rgba(253, 253, 253, 0.2);
  box-sizing: border-box;
}

.LeaSidebarTop img {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  object-fit: cover;
  display: block;
}

.LeaSidebarMenu {
  display: flex;
  flex-direction: column;
  padding: 12px 8px;
  gap: 4px;
  align-items: center;
  flex: 1;
}

.LeaSidebarMain .MenuBtn {
  width: 100%;
  padding: 12px 16px;
  background: transparent;
  color: #ffffff;
  border: none;
  border-radius: 8px;
  text-align: left;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.2s;
  display: flex;
  align-items: center;
  gap: 10px;
}

.LeaSidebarMain .MenuBtn:hover {
  background: rgba(255, 255, 255, 0.1);
}

.LeaSidebarMain .MenuBtn.active {
  background: rgba(255, 255, 255, 0.2);
  font-weight: 600;
}

.LeaSidebarMain .MenuIcons svg {
  width: 21px;
  height: 21px;
  display: block;
}

/* ========================================== */
/* FDA Admin Sidebar Styles                   */
/* ========================================== */
.FdaAdminSidebarMain {
  width: 280px;
  height: 100vh;
  background: #1B4332;
  display: flex;
  flex-direction: column;
  position: relative;
  box-sizing: border-box;
}

.FdaAdminSidebarTop {
  width: 280px;
  min-height: 70px;
  height: fit-content;
  display: flex;
  justify-content: center;
  gap: 10px;
  align-items: center;
  padding: 10px;
  color: #fdfdfd;
  font-size: small;
  border-bottom: 1px solid rgba(253, 253, 253, 0.2);
  box-sizing: border-box;
}

.FdaAdminSidebarTop img {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  object-fit: cover;
  display: block;
}

.FdaAdminSidebarMenu {
  display: flex;
  flex-direction: column;
  padding: 12px 8px;
  gap: 4px;
  align-items: center;
  flex: 1;
}

.FdaAdminMenuBtn {
  width: 100%;
  padding: 12px 16px;
  background: transparent;
  color: #ffffff;
  border: none;
  border-radius: 8px;
  text-align: left;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.2s;
  display: flex;
  align-items: center;
  gap: 10px;
}

.FdaAdminMenuBtn:hover {
  background: rgba(255, 255, 255, 0.1);
}

.FdaAdminMenuBtn.active {
  background: rgba(255, 255, 255, 0.2);
  font-weight: 600;
}

.FdaAdminMenuIcons svg {
  width: 21px;
  height: 21px;
  display: block;
}

/* ========================================== */
/* LEA Admin Sidebar Styles                   */
/* ========================================== */
.LeaAdminSidebarMain {
  width: 250px;
  height: 100vh;
  background: #1a1a2e;
  display: flex;
  flex-direction: column;
  position: relative;
  box-sizing: border-box;
}

.LeaAdminSidebarTop {
  width: 250px;
  min-height: 70px;
  height: fit-content;
  display: flex;
  justify-content: center;
  gap: 10px;
  align-items: center;
  padding: 10px;
  color: #fdfdfd;
  font-size: small;
  border-bottom: 1px solid rgba(253, 253, 253, 0.2);
  box-sizing: border-box;
}

.LeaAdminSidebarTop img {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  object-fit: cover;
  display: block;
}

.LeaAdminSidebarMenu {
  display: flex;
  flex-direction: column;
  padding: 12px 8px;
  gap: 4px;
  align-items: center;
  flex: 1;
}

.LeaAdminMenuBtn {
  width: 100%;
  padding: 12px 16px;
  background: transparent;
  color: #ffffff;
  border: none;
  border-radius: 8px;
  text-align: left;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.2s;
  display: flex;
  align-items: center;
  gap: 10px;
}

.LeaAdminMenuBtn:hover {
  background: rgba(255, 255, 255, 0.1);
}

.LeaAdminMenuBtn.active {
  background: rgba(255, 255, 255, 0.2);
  font-weight: 600;
}

.LeaAdminMenuIcons svg {
  width: 21px;
  height: 21px;
  display: block;
}

/* ========================================================== */
/* RESPONSIVE SIDEBAR STYLES (shared across all workspaces)   */
/* ========================================================== */

.SidebarLogoWrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.SidebarWorkspaceTitle {
  margin: 0;
  white-space: nowrap;
  font-size: 14px;
  font-weight: 600;
}

.SidebarOverlay {
  display: none;
}

.SidebarMobileTrigger {
  display: none;
}

.SidebarHamburgerBtn {
  display: none;
  width: 100%;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 10px 0;
  color: #ffffff;
  border-bottom: 1px solid rgba(253, 253, 253, 0.15);
  box-sizing: border-box;
  transition: background 0.2s;
}

.SidebarMobileTrigger.IsOpen {
  color: #ffffff;
}

.SidebarHamburgerBtn:hover {
  background: rgba(255, 255, 255, 0.08);
}

/* All sidebars smooth transition for width/collapse */
.NationalAdminSidebarMain,
.SuperAdminSidebarMain,
.FdaAdminSidebarMain,
.FdaSidebarMain,
.LeaAdminSidebarMain,
.LeaSidebarMain {
  transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.3s ease;
}

/* TABLET: 768px - 1199px -> icon-only collapse */
@media (max-width: 1199px) and (min-width: 768px) {
  .NationalAdminSidebarMain,
  .SuperAdminSidebarMain,
  .FdaAdminSidebarMain,
  .FdaSidebarMain,
  .LeaAdminSidebarMain,
  .LeaSidebarMain {
    width: 60px;
    overflow: visible;
  }

  /* Hamburger at TOP of sidebar when collapsed */
  .SidebarHamburgerBtn {
    display: flex;
    order: 1;
    height: 52px;
    padding: 0;
    z-index: 15;
  }

  /* Navigation menu in the MIDDLE */
  .NationalAdminSidebarMenu,
  .SuperAdminSidebarMenu,
  .FdaAdminSidebarMenu,
  .FdaSidebarMenu,
  .LeaAdminSidebarMenu,
  .LeaSidebarMenu {
    order: 2;
    flex: 1;
    padding: 12px 6px;
    margin-bottom: 64px;
    transition: margin-bottom 0.3s ease;
    /* overflow: visible so ::after tooltips can appear outside the 60px rail */
    overflow: visible;
  }

  .NationalAdminSidebarTop,
  .SuperAdminSidebarTop,
  .FdaAdminSidebarTop,
  .FdaSidebarTop,
  .LeaAdminSidebarTop,
  .LeaSidebarTop {
    width: 60px;
    min-height: 0;
    height: 0;
    padding: 0;
    border-bottom: none;
    position: static;
    display: flex;
    align-items: center;
  }

  .NationalAdminSidebarTop p,
  .SuperAdminSidebarTop p,
  .FdaAdminSidebarTop p,
  .FdaSidebarTop p,
  .LeaAdminSidebarTop p,
  .LeaSidebarTop p,
  .SidebarWorkspaceTitle {
    display: none;
    opacity: 0;
  }

  /* Logo positioned at the BOTTOM when collapsed, with smooth transition */
  .SidebarLogoWrapper {
    position: absolute;
    top: calc(100% - 58px);
    left: 50%;
    transform: translateX(-50%);
    width: 36px;
    height: 36px;
    z-index: 10;
    transition: top 0.3s cubic-bezier(0.4, 0, 0.2, 1),
                left 0.3s cubic-bezier(0.4, 0, 0.2, 1),
                transform 0.3s cubic-bezier(0.4, 0, 0.2, 1),
                width 0.3s ease,
                height 0.3s ease;
  }

  .SidebarLogoWrapper img,
  .NationalAdminSidebarTop img,
  .SuperAdminSidebarTop img,
  .FdaAdminSidebarTop img,
  .FdaSidebarTop img,
  .LeaAdminSidebarTop img,
  .LeaSidebarTop img {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    transition: width 0.3s ease, height 0.3s ease;
  }

  .NationalAdminSidebarMenu .MenuLabels,
  .SuperAdminSidebarMenu .MenuLabels,
  .FdaAdminSidebarMenu .FdaAdminMenuLabels,
  .FdaSidebarMenu .FdaMenuLabels,
  .LeaAdminSidebarMenu .LeaAdminMenuLabels,
  .LeaSidebarMain .MenuLabels {
    display: none;
  }

  .NationalAdminSidebarMenu .MenuBtn,
  .SuperAdminSidebarMenu .MenuBtn,
  .FdaAdminSidebarMenu .FdaAdminMenuBtn,
  .FdaSidebarMenu .FdaMenuBtn,
  .LeaAdminSidebarMenu .LeaAdminMenuBtn,
  .LeaSidebarMain .MenuBtn {
    justify-content: center;
    padding: 12px 0;
    position: relative;
  }

  /* keyboard + hover accessible tooltip */
  .NationalAdminSidebarMenu .MenuBtn[data-tooltip]:hover::after,
  .NationalAdminSidebarMenu .MenuBtn[data-tooltip]:focus-visible::after,
  .SuperAdminSidebarMenu .MenuBtn[data-tooltip]:hover::after,
  .SuperAdminSidebarMenu .MenuBtn[data-tooltip]:focus-visible::after,
  .FdaAdminSidebarMenu .FdaAdminMenuBtn[data-tooltip]:hover::after,
  .FdaAdminSidebarMenu .FdaAdminMenuBtn[data-tooltip]:focus-visible::after,
  .FdaSidebarMenu .FdaMenuBtn[data-tooltip]:hover::after,
  .FdaSidebarMenu .FdaMenuBtn[data-tooltip]:focus-visible::after,
  .LeaAdminSidebarMenu .LeaAdminMenuBtn[data-tooltip]:hover::after,
  .LeaAdminSidebarMenu .LeaAdminMenuBtn[data-tooltip]:focus-visible::after,
  .LeaSidebarMain .MenuBtn[data-tooltip]:hover::after,
  .LeaSidebarMain .MenuBtn[data-tooltip]:focus-visible::after {
    content: attr(data-tooltip);
    position: absolute;
    left: calc(100% + 10px);
    top: 50%;
    transform: translateY(-50%);
    background: #111827;
    color: #ffffff;
    padding: 6px 10px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    white-space: nowrap;
    pointer-events: none;
    z-index: 999;
    box-shadow: 0 4px 10px rgba(0,0,0,0.25);
  }

  /* Temporary expand via hamburger (overlay, doesn't shift layout) */
  .NationalAdminSidebarMain.MenuOpen,
  .SuperAdminSidebarMain.MenuOpen,
  .FdaAdminSidebarMain.MenuOpen,
  .FdaSidebarMain.MenuOpen,
  .LeaAdminSidebarMain.MenuOpen,
  .LeaSidebarMain.MenuOpen {
    width: 280px;
    position: absolute;
    top: 0;
    left: 0;
    height: 100vh;
    z-index: 100;
    box-shadow: 4px 0 16px rgba(0,0,0,0.25);
  }

  .NationalAdminSidebarMain.MenuOpen .NationalAdminSidebarTop,
  .SuperAdminSidebarMain.MenuOpen .SuperAdminSidebarTop,
  .FdaAdminSidebarMain.MenuOpen .FdaAdminSidebarTop,
  .FdaSidebarMain.MenuOpen .FdaSidebarTop,
  .LeaAdminSidebarMain.MenuOpen .LeaAdminSidebarTop,
  .LeaSidebarMain.MenuOpen .LeaSidebarTop {
    width: 280px;
    min-height: 70px;
    height: fit-content;
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: flex-start;
    padding: 14px 16px;
    border-bottom: 1px solid rgba(253, 253, 253, 0.2);
    order: 1;
    position: relative;
  }

  .NationalAdminSidebarMain.MenuOpen .SidebarHamburgerBtn,
  .SuperAdminSidebarMain.MenuOpen .SidebarHamburgerBtn,
  .FdaAdminSidebarMain.MenuOpen .SidebarHamburgerBtn,
  .FdaSidebarMain.MenuOpen .SidebarHamburgerBtn,
  .LeaAdminSidebarMain.MenuOpen .SidebarHamburgerBtn,
  .LeaSidebarMain.MenuOpen .SidebarHamburgerBtn {
    position: absolute;
    top: 16px;
    right: 12px;
    width: 36px;
    height: 36px;
    padding: 0;
    border-bottom: none;
    border-radius: 6px;
    z-index: 20;
  }

  .NationalAdminSidebarMain.MenuOpen .SidebarLogoWrapper,
  .SuperAdminSidebarMain.MenuOpen .SidebarLogoWrapper,
  .FdaAdminSidebarMain.MenuOpen .SidebarLogoWrapper,
  .FdaSidebarMain.MenuOpen .SidebarLogoWrapper,
  .LeaAdminSidebarMain.MenuOpen .SidebarLogoWrapper,
  .LeaSidebarMain.MenuOpen .SidebarLogoWrapper {
    position: static;
    top: auto;
    left: auto;
    transform: none;
    width: 44px;
    height: 44px;
    flex-shrink: 0;
  }

  .NationalAdminSidebarMain.MenuOpen .SidebarLogoWrapper img,
  .SuperAdminSidebarMain.MenuOpen .SidebarLogoWrapper img,
  .FdaAdminSidebarMain.MenuOpen .SidebarLogoWrapper img,
  .FdaSidebarMain.MenuOpen .SidebarLogoWrapper img,
  .LeaAdminSidebarMain.MenuOpen .SidebarLogoWrapper img,
  .LeaSidebarMain.MenuOpen .SidebarLogoWrapper img {
    width: 44px;
    height: 44px;
  }

  .NationalAdminSidebarMain.MenuOpen .NationalAdminSidebarTop p,
  .SuperAdminSidebarMain.MenuOpen .SuperAdminSidebarTop p,
  .FdaAdminSidebarMain.MenuOpen .FdaAdminSidebarTop p,
  .FdaSidebarMain.MenuOpen .FdaSidebarTop p,
  .LeaAdminSidebarMain.MenuOpen .LeaAdminSidebarTop p,
  .LeaSidebarMain.MenuOpen .LeaSidebarTop p,
  .NationalAdminSidebarMain.MenuOpen .SidebarWorkspaceTitle,
  .SuperAdminSidebarMain.MenuOpen .SidebarWorkspaceTitle,
  .FdaAdminSidebarMain.MenuOpen .SidebarWorkspaceTitle,
  .FdaSidebarMain.MenuOpen .SidebarWorkspaceTitle,
  .LeaAdminSidebarMain.MenuOpen .SidebarWorkspaceTitle,
  .LeaSidebarMain.MenuOpen .SidebarWorkspaceTitle {
    display: block;
    opacity: 1;
    color: #fdfdfd;
    font-size: 14px;
    font-weight: 600;
    margin-left: 0;
  }

  .NationalAdminSidebarMain.MenuOpen .NationalAdminSidebarMenu,
  .SuperAdminSidebarMain.MenuOpen .SuperAdminSidebarMenu,
  .FdaAdminSidebarMain.MenuOpen .FdaAdminSidebarMenu,
  .FdaSidebarMain.MenuOpen .FdaSidebarMenu,
  .LeaAdminSidebarMain.MenuOpen .LeaAdminSidebarMenu,
  .LeaSidebarMain.MenuOpen .LeaSidebarMenu {
    margin-bottom: 0;
  }

  .NationalAdminSidebarMain.MenuOpen .MenuLabels,
  .SuperAdminSidebarMain.MenuOpen .MenuLabels,
  .FdaAdminSidebarMain.MenuOpen .FdaAdminMenuLabels,
  .FdaSidebarMain.MenuOpen .FdaMenuLabels,
  .LeaAdminSidebarMain.MenuOpen .LeaAdminMenuLabels,
  .LeaSidebarMain.MenuOpen .MenuLabels {
    display: inline;
  }

  .NationalAdminSidebarMain.MenuOpen .MenuBtn,
  .SuperAdminSidebarMain.MenuOpen .MenuBtn,
  .FdaAdminSidebarMain.MenuOpen .FdaAdminMenuBtn,
  .FdaSidebarMain.MenuOpen .FdaMenuBtn,
  .LeaAdminSidebarMain.MenuOpen .LeaAdminMenuBtn,
  .LeaSidebarMain.MenuOpen .MenuBtn {
    justify-content: flex-start;
    padding: 12px 16px;
  }

  .NationalAdminSidebarMain.MenuOpen .MenuBtn[data-tooltip]:hover::after,
  .SuperAdminSidebarMain.MenuOpen .MenuBtn[data-tooltip]:hover::after,
  .FdaAdminSidebarMain.MenuOpen .FdaAdminMenuBtn[data-tooltip]:hover::after,
  .FdaSidebarMain.MenuOpen .FdaMenuBtn[data-tooltip]:hover::after,
  .LeaAdminSidebarMain.MenuOpen .LeaAdminMenuBtn[data-tooltip]:hover::after,
  .LeaSidebarMain.MenuOpen .MenuBtn[data-tooltip]:hover::after {
    content: none;
  }
}

/* MOBILE: below 768px -> off-canvas drawer */
@media (max-width: 767px) {
  .SidebarMobileTrigger {
    display: flex;
    position: fixed;
    top: 14px;
    left: 14px;
    width: 40px;
    height: 40px;
    align-items: center;
    justify-content: center;
    background: none;
    color: #111827;
    border: none;
    cursor: pointer;
    z-index: 120;
  }

  .SidebarMobileTrigger.IsOpen {
    display: none;
  }

  .NationalAdminSidebarMain,
  .SuperAdminSidebarMain,
  .FdaAdminSidebarMain,
  .FdaSidebarMain,
  .LeaAdminSidebarMain,
  .LeaSidebarMain {
    position: fixed;
    top: 0;
    left: 0;
    width: 280px;
    height: 100vh;
    transform: translateX(-100%);
    z-index: 110;
  }

  .NationalAdminSidebarMain.MenuOpen,
  .SuperAdminSidebarMain.MenuOpen,
  .FdaAdminSidebarMain.MenuOpen,
  .FdaSidebarMain.MenuOpen,
  .LeaAdminSidebarMain.MenuOpen,
  .LeaSidebarMain.MenuOpen {
    transform: translateX(0); 
  }

  .NationalAdminSidebarTop,
  .SuperAdminSidebarTop,
  .FdaAdminSidebarTop,
  .FdaSidebarTop,
  .LeaAdminSidebarTop,
  .LeaSidebarTop {
    width: 280px;
  }

  .NationalAdminSidebarMain.MenuOpen .NationalAdminSidebarTop,
  .SuperAdminSidebarMain.MenuOpen .SuperAdminSidebarTop,
  .FdaAdminSidebarMain.MenuOpen .FdaAdminSidebarTop,
  .FdaSidebarMain.MenuOpen .FdaSidebarTop,
  .LeaAdminSidebarMain.MenuOpen .LeaAdminSidebarTop,
  .LeaSidebarMain.MenuOpen .LeaSidebarTop {
    width: 280px;
    min-height: 70px;
    height: fit-content;
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: flex-start;
    padding: 10px 48px 10px 12px;
    border-bottom: 1px solid rgba(253, 253, 253, 0.2);
    position: relative;
    box-sizing: border-box;
  }

  .SidebarHamburgerBtn {
    display: none;
  }

  .NationalAdminSidebarMain.MenuOpen .SidebarHamburgerBtn,
  .SuperAdminSidebarMain.MenuOpen .SidebarHamburgerBtn,
  .FdaAdminSidebarMain.MenuOpen .SidebarHamburgerBtn,
  .FdaSidebarMain.MenuOpen .SidebarHamburgerBtn,
  .LeaAdminSidebarMain.MenuOpen .SidebarHamburgerBtn,
  .LeaSidebarMain.MenuOpen .SidebarHamburgerBtn {
    display: flex;
    position: absolute;
    top: 17px;
    right: 12px;
    width: 36px;
    height: 36px;
    padding: 0;
    border-bottom: none;
    border-radius: 6px;
    z-index: 20;
  }

  .NationalAdminSidebarMain.MenuOpen .SidebarLogoWrapper,
  .SuperAdminSidebarMain.MenuOpen .SidebarLogoWrapper,
  .FdaAdminSidebarMain.MenuOpen .SidebarLogoWrapper,
  .FdaSidebarMain.MenuOpen .SidebarLogoWrapper,
  .LeaAdminSidebarMain.MenuOpen .SidebarLogoWrapper,
  .LeaSidebarMain.MenuOpen .SidebarLogoWrapper {
    position: static;
    flex-shrink: 0;
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .NationalAdminSidebarMain.MenuOpen .SidebarLogoWrapper img,
  .SuperAdminSidebarMain.MenuOpen .SidebarLogoWrapper img,
  .FdaAdminSidebarMain.MenuOpen .SidebarLogoWrapper img,
  .FdaSidebarMain.MenuOpen .SidebarLogoWrapper img,
  .LeaAdminSidebarMain.MenuOpen .SidebarLogoWrapper img,
  .LeaSidebarMain.MenuOpen .SidebarLogoWrapper img {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    object-fit: cover;
  }

  .NationalAdminSidebarMain.MenuOpen .SidebarWorkspaceTitle,
  .SuperAdminSidebarMain.MenuOpen .SidebarWorkspaceTitle,
  .FdaAdminSidebarMain.MenuOpen .SidebarWorkspaceTitle,
  .FdaSidebarMain.MenuOpen .SidebarWorkspaceTitle,
  .LeaAdminSidebarMain.MenuOpen .SidebarWorkspaceTitle,
  .LeaSidebarMain.MenuOpen .SidebarWorkspaceTitle {
    flex: 1;
    text-align: center;
    font-size: 13px;
    font-weight: 600;
    color: #fdfdfd;
    margin: 0 4px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .SidebarOverlay.MenuOpen {
    display: block;
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.4);
    z-index: 105;
  }
}
`

function Sidebar({ sidebarType, role, agency }) {
    const navigate = useNavigate()
    const location = useLocation()
    const sidebarRef = useRef(null)

    // Controls tablet temporary expand AND mobile off-canvas open
    const [menuOpen, setMenuOpen] = useState(false)

    // Close the expanded/drawer sidebar when clicking outside it
    useEffect(() => {
        function handleClickOutside(e) {
            if (!menuOpen) return
            if (sidebarRef.current && sidebarRef.current.contains(e.target)) return
            if (e.target.closest && e.target.closest('.SidebarMobileTrigger, .SidebarHamburgerBtn')) return
            setMenuOpen(false)
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [menuOpen])

    // Auto-close the expanded/drawer sidebar after navigating
    useEffect(() => {
        setMenuOpen(false)
    }, [location.pathname])

    function toggleMenu() {
        setMenuOpen((prev) => !prev)
    }

    // Determine type to render
    let type = sidebarType ? sidebarType.toUpperCase() : null
    if (!type) {
        const normalizedRole = (role || '').toUpperCase()
        const normalizedAgency = (agency || '').toUpperCase()
        if (
            normalizedRole === 'SUPER_ADMIN' ||
            normalizedRole === 'SUPERADMIN' ||
            normalizedRole === 'NATIONAL_ADMIN' ||
            normalizedRole === 'NATIONALADMIN'
        ) {
            type = 'NATIONAL_ADMIN'
        } else if (
            normalizedRole === 'FDA_ADMIN' ||
            normalizedRole === 'FDAADMIN' ||
            ((normalizedRole === 'ADMIN' || normalizedRole.includes('ADMIN')) && (normalizedAgency === 'FDA' || normalizedAgency.includes('FDA')))
        ) {
            type = 'FDA_ADMIN'
        } else if (
            normalizedRole === 'LEA_ADMIN' ||
            normalizedRole === 'LEAADMIN' ||
            ((normalizedRole === 'ADMIN' || normalizedRole.includes('ADMIN')) && (normalizedAgency === 'LEA' || normalizedAgency === 'CIDG' || normalizedAgency.includes('LEA') || normalizedAgency.includes('CIDG')))
        ) {
            type = 'LEA_ADMIN'
        } else if (normalizedRole === 'FDA' || normalizedAgency === 'FDA') {
            type = 'FDA'
        } else if (normalizedRole === 'LEA' || normalizedAgency === 'LEA' || normalizedAgency === 'CIDG') {
            type = 'LEA'
        }
    }

    // End session / logout handler
    async function handleLogout() {
        const refreshToken = localStorage.getItem('refresh_token');

        try {
            if (refreshToken) {
                await fetch(`${API_BASE_URL}/auth/token/revoke`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ refresh_token: refreshToken }),
                });
            }
        } catch (err) {
            console.error('Failed to revoke session:', err);
        }

        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');

        if (type === 'NATIONAL_ADMIN' || type === 'SUPER_ADMIN') {
            navigate('/');
        } else {
            navigate('/login');
        }
    }

    const renderStyles = () => (
        <style dangerouslySetInnerHTML={{ __html: sidebarStyles }} />
    )

    if (type === 'NATIONAL_ADMIN' || type === 'SUPER_ADMIN') {
        return (
            <>
                {renderStyles()}
                <button
                    className={`SidebarMobileTrigger ${menuOpen ? 'IsOpen' : ''}`}
                    aria-label={menuOpen ? 'Close sidebar menu' : 'Open sidebar menu'}
                    onClick={toggleMenu}
                >
                    <Menu size={20} />
                </button>
                <div
                    className={`SidebarOverlay ${menuOpen ? 'MenuOpen' : ''}`}
                    onClick={() => setMenuOpen(false)}
                />
                <div className={`NationalAdminSidebarMain SuperAdminSidebarMain ${menuOpen ? 'MenuOpen' : ''}`} ref={sidebarRef}>
                    <div className='NationalAdminSidebarTop SuperAdminSidebarTop'>
                        <div className='SidebarLogoWrapper'><img src={ICMDALogo} alt="ICMDA Logo" /></div>
                        <p className='SidebarWorkspaceTitle'>National Admin Workspace</p>
                    </div>
                    <button
                        className='SidebarHamburgerBtn'
                        aria-label={menuOpen ? 'Collapse menu' : 'Expand menu'}
                        onClick={toggleMenu}
                    >
                        <Menu size={20} />
                    </button>
                    <div className='NationalAdminSidebarMenu SuperAdminSidebarMenu'>
                        {NationalAdminMenuItems.map((item) => {
                            const Icon = item.icon
                            return (
                                <button
                                    key={item.path}
                                    className={`MenuBtn ${location.pathname === item.path ? 'active' : ''}`}
                                    onClick={() => navigate(item.path)}
                                    data-tooltip={item.label}
                                >
                                    <span className='MenuIcons'>{Icon && <Icon />}</span>
                                    <span className='MenuLabels'>{item.label}</span>
                                </button>
                            )
                        })}
                    </div>
                </div>
            </>
        )
    }

    if (type === 'FDA_ADMIN') {
        return (
            <>
                {renderStyles()}
                <button
                    className={`SidebarMobileTrigger ${menuOpen ? 'IsOpen' : ''}`}
                    aria-label={menuOpen ? 'Close sidebar menu' : 'Open sidebar menu'}
                    onClick={toggleMenu}
                >
                    <Menu size={20} />
                </button>
                <div
                    className={`SidebarOverlay ${menuOpen ? 'MenuOpen' : ''}`}
                    onClick={() => setMenuOpen(false)}
                />
                <div className={`FdaAdminSidebarMain ${menuOpen ? 'MenuOpen' : ''}`} ref={sidebarRef}>
                    <div className='FdaAdminSidebarTop'>
                        <div className='SidebarLogoWrapper'><img src={FDALogo} alt="FDA Logo" /></div>
                        <p className='SidebarWorkspaceTitle'>FDA Admin Workspace</p>
                    </div>
                    <button
                        className='SidebarHamburgerBtn'
                        aria-label={menuOpen ? 'Collapse menu' : 'Expand menu'}
                        onClick={toggleMenu}
                    >
                        <Menu size={20} />
                    </button>
                    <div className='FdaAdminSidebarMenu'>
                        {FDAAdminMenuItems.map((item) => {
                            const Icon = item.icon
                            return (
                                <button
                                    key={item.path}
                                    className={`FdaAdminMenuBtn ${location.pathname === item.path ? 'active' : ''}`}
                                    onClick={() => navigate(item.path)}
                                    data-tooltip={item.label}
                                >
                                    <span className='FdaAdminMenuIcons'><Icon /></span>
                                    <span className='FdaAdminMenuLabels'>{item.label}</span>
                                </button>
                            )
                        })}
                    </div>
                </div>
            </>
        )
    }

    if (type === 'LEA_ADMIN') {
        return (
            <>
                {renderStyles()}
                <button
                    className={`SidebarMobileTrigger ${menuOpen ? 'IsOpen' : ''}`}
                    aria-label={menuOpen ? 'Close sidebar menu' : 'Open sidebar menu'}
                    onClick={toggleMenu}
                >
                    <Menu size={20} />
                </button>
                <div
                    className={`SidebarOverlay ${menuOpen ? 'MenuOpen' : ''}`}
                    onClick={() => setMenuOpen(false)}
                />
                <div className={`LeaAdminSidebarMain ${menuOpen ? 'MenuOpen' : ''}`} ref={sidebarRef}>
                    <div className='LeaAdminSidebarTop'>
                        <div className='SidebarLogoWrapper'><img src={CIDGLogo} alt="CIDG LOGO" /></div>
                        <p className='SidebarWorkspaceTitle'>LEA Admin Workspace</p>
                    </div>
                    <button
                        className='SidebarHamburgerBtn'
                        aria-label={menuOpen ? 'Collapse menu' : 'Expand menu'}
                        onClick={toggleMenu}
                    >
                        <Menu size={20} />
                    </button>
                    <div className='LeaAdminSidebarMenu'>
                        {LeaAdminMenuItems.map((item) => {
                            const Icon = item.icon
                            return (
                                <button
                                    key={item.path}
                                    className={`LeaAdminMenuBtn ${location.pathname === item.path ? 'active' : ''}`}
                                    onClick={() => navigate(item.path)}
                                    data-tooltip={item.label}
                                >
                                    <span className='LeaAdminMenuIcons'><Icon /></span>
                                    <span className='LeaAdminMenuLabels'>{item.label}</span>
                                </button>
                            )
                        })}
                    </div>
                </div>
            </>
        )
    }

    if (type === 'FDA') {
        return (
            <>
                {renderStyles()}
                <button
                    className={`SidebarMobileTrigger ${menuOpen ? 'IsOpen' : ''}`}
                    aria-label={menuOpen ? 'Close sidebar menu' : 'Open sidebar menu'}
                    onClick={toggleMenu}
                >
                    <Menu size={20} />
                </button>
                <div
                    className={`SidebarOverlay ${menuOpen ? 'MenuOpen' : ''}`}
                    onClick={() => setMenuOpen(false)}
                />
                <div className={`FdaSidebarMain ${menuOpen ? 'MenuOpen' : ''}`} ref={sidebarRef}>
                    <div className='FdaSidebarTop'>
                        <div className='SidebarLogoWrapper'><img src={FDALogo} alt="FDA Logo" /></div>
                        <p className='SidebarWorkspaceTitle'>FDA Workspace</p>
                    </div>
                    <button
                        className='SidebarHamburgerBtn'
                        aria-label={menuOpen ? 'Collapse menu' : 'Expand menu'}
                        onClick={toggleMenu}
                    >
                        <Menu size={20} />
                    </button>
                    <div className='FdaSidebarMenu'>
                        {FDAMenuItems.map((item) => {
                            const Icon = item.icon
                            return (
                                <button
                                    key={item.path}
                                    className={`FdaMenuBtn ${location.pathname === item.path ? 'active' : ''}`}
                                    onClick={() => navigate(item.path)}
                                    data-tooltip={item.label}>
                                    <span className='FdaMenuIcons'><Icon /></span>
                                    <span className='FdaMenuLabels'>{item.label}</span>
                                </button>
                            )
                        })}
                    </div>
                </div>
            </>
        )
    }

    if (type === 'LEA') {
        return (
            <>
                {renderStyles()}
                <button
                    className={`SidebarMobileTrigger ${menuOpen ? 'IsOpen' : ''}`}
                    aria-label={menuOpen ? 'Close sidebar menu' : 'Open sidebar menu'}
                    onClick={toggleMenu}
                >
                    <Menu size={20} />
                </button>
                <div
                    className={`SidebarOverlay ${menuOpen ? 'MenuOpen' : ''}`}
                    onClick={() => setMenuOpen(false)}
                />
                <div className={`LeaSidebarMain ${menuOpen ? 'MenuOpen' : ''}`} ref={sidebarRef}>
                    <div className='LeaSidebarTop'>
                        <div className='SidebarLogoWrapper'><img src={CIDGLogo} alt="CIDG LOGO" /></div>
                        <p className='SidebarWorkspaceTitle'>LEA-CIDG Workspace</p>
                    </div>
                    <button
                        className='SidebarHamburgerBtn'
                        aria-label={menuOpen ? 'Collapse menu' : 'Expand menu'}
                        onClick={toggleMenu}
                    >
                        <Menu size={20} />
                    </button>
                    <div className='LeaSidebarMenu'>
                        {LeaMenuItems.map((item) => {
                            const Icon = item.icon
                            return (
                                <button
                                    key={item.path}
                                    className={`MenuBtn ${location.pathname === item.path ? 'active' : ''}`}
                                    onClick={() => navigate(item.path)}
                                    data-tooltip={item.label}>
                                    <span className='MenuIcons'><Icon /></span>
                                    <span className='MenuLabels'>{item.label}</span>
                                </button>
                            )
                        })}
                    </div>
                </div>
            </>
        )
    }

    return null
}

export default Sidebar