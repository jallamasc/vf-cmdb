--
-- PostgreSQL database dump
--

\restrict htNC0o0sLohPdbpSo8lzwKVPgqB76VjitQeyjpnTouidrdceBVnlupRPbt6fIKj

-- Dumped from database version 16.15 (Debian 16.15-1.pgdg13+2)
-- Dumped by pg_dump version 16.15 (Debian 16.15-1.pgdg13+2)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: abbreviation_registry; Type: TABLE; Schema: public; Owner: vfcmdb
--

CREATE TABLE public.abbreviation_registry (
    id integer NOT NULL,
    abbreviation character varying(40) NOT NULL,
    entity_type character varying(60) NOT NULL,
    entity_id integer NOT NULL,
    field_name character varying(40) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_abbreviation_registry_charset CHECK (((abbreviation IS NULL) OR ((abbreviation)::text ~ '^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$'::text)))
);


ALTER TABLE public.abbreviation_registry OWNER TO vfcmdb;

--
-- Name: abbreviation_registry_id_seq; Type: SEQUENCE; Schema: public; Owner: vfcmdb
--

CREATE SEQUENCE public.abbreviation_registry_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.abbreviation_registry_id_seq OWNER TO vfcmdb;

--
-- Name: abbreviation_registry_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: vfcmdb
--

ALTER SEQUENCE public.abbreviation_registry_id_seq OWNED BY public.abbreviation_registry.id;


--
-- Name: alembic_version; Type: TABLE; Schema: public; Owner: vfcmdb
--

CREATE TABLE public.alembic_version (
    version_num character varying(32) NOT NULL
);


ALTER TABLE public.alembic_version OWNER TO vfcmdb;

--
-- Name: app_types; Type: TABLE; Schema: public; Owner: vfcmdb
--

CREATE TABLE public.app_types (
    id integer NOT NULL,
    full_name character varying(120) NOT NULL,
    abbreviation character varying(20) NOT NULL,
    max_length integer,
    description text,
    case_enforcement character varying(9) DEFAULT 'mixed'::character varying NOT NULL,
    trim_mode character varying(10) DEFAULT 'manual'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    icon character varying(60),
    CONSTRAINT ck_app_types_abbreviation_charset CHECK (((abbreviation IS NULL) OR ((abbreviation)::text ~ '^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$'::text)))
);


ALTER TABLE public.app_types OWNER TO vfcmdb;

--
-- Name: app_types_id_seq; Type: SEQUENCE; Schema: public; Owner: vfcmdb
--

CREATE SEQUENCE public.app_types_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.app_types_id_seq OWNER TO vfcmdb;

--
-- Name: app_types_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: vfcmdb
--

ALTER SEQUENCE public.app_types_id_seq OWNED BY public.app_types.id;


--
-- Name: brands; Type: TABLE; Schema: public; Owner: vfcmdb
--

CREATE TABLE public.brands (
    id integer NOT NULL,
    full_name character varying(120) NOT NULL,
    abbreviation character varying(20) NOT NULL,
    max_length integer,
    description text,
    case_enforcement character varying(9) DEFAULT 'mixed'::character varying NOT NULL,
    trim_mode character varying(10) DEFAULT 'manual'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    icon character varying(60),
    logo_url character varying(500),
    CONSTRAINT ck_brands_abbreviation_charset CHECK (((abbreviation IS NULL) OR ((abbreviation)::text ~ '^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$'::text)))
);


ALTER TABLE public.brands OWNER TO vfcmdb;

--
-- Name: brands_id_seq; Type: SEQUENCE; Schema: public; Owner: vfcmdb
--

CREATE SEQUENCE public.brands_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.brands_id_seq OWNER TO vfcmdb;

--
-- Name: brands_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: vfcmdb
--

ALTER SEQUENCE public.brands_id_seq OWNED BY public.brands.id;


--
-- Name: buildings; Type: TABLE; Schema: public; Owner: vfcmdb
--

CREATE TABLE public.buildings (
    id integer NOT NULL,
    full_name character varying(120) NOT NULL,
    abbreviation character varying(20) NOT NULL,
    max_length integer,
    description text,
    case_enforcement character varying(9) DEFAULT 'mixed'::character varying NOT NULL,
    trim_mode character varying(10) DEFAULT 'manual'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    icon character varying(60),
    building_type character varying(40),
    number integer,
    campus_id integer,
    naming_mode character varying(10) DEFAULT 'auto'::character varying NOT NULL,
    CONSTRAINT ck_buildings_abbreviation_charset CHECK (((abbreviation IS NULL) OR ((abbreviation)::text ~ '^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$'::text))),
    CONSTRAINT ck_buildings_naming_mode CHECK (((naming_mode)::text = ANY ((ARRAY['auto'::character varying, 'manual'::character varying])::text[])))
);


ALTER TABLE public.buildings OWNER TO vfcmdb;

--
-- Name: buildings_id_seq; Type: SEQUENCE; Schema: public; Owner: vfcmdb
--

CREATE SEQUENCE public.buildings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.buildings_id_seq OWNER TO vfcmdb;

--
-- Name: buildings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: vfcmdb
--

ALTER SEQUENCE public.buildings_id_seq OWNED BY public.buildings.id;


--
-- Name: cables; Type: TABLE; Schema: public; Owner: vfcmdb
--

CREATE TABLE public.cables (
    id integer NOT NULL,
    cable_type character varying(20) NOT NULL,
    port_a_type character varying(40),
    port_a_id integer,
    port_b_type character varying(40),
    port_b_id integer,
    label_a character varying(120),
    label_b character varying(120),
    media_type character varying(40),
    length_meters double precision,
    label character varying(200),
    auto_generated boolean DEFAULT false NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.cables OWNER TO vfcmdb;

--
-- Name: cables_id_seq; Type: SEQUENCE; Schema: public; Owner: vfcmdb
--

CREATE SEQUENCE public.cables_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.cables_id_seq OWNER TO vfcmdb;

--
-- Name: cables_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: vfcmdb
--

ALTER SEQUENCE public.cables_id_seq OWNED BY public.cables.id;


--
-- Name: campuses; Type: TABLE; Schema: public; Owner: vfcmdb
--

CREATE TABLE public.campuses (
    id integer NOT NULL,
    full_name character varying(120) NOT NULL,
    abbreviation character varying(20) NOT NULL,
    max_length integer,
    description text,
    case_enforcement character varying(9) DEFAULT 'mixed'::character varying NOT NULL,
    trim_mode character varying(10) DEFAULT 'manual'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    icon character varying(60),
    organization_id integer,
    region_id integer,
    tia606b_field_id integer,
    naming_mode character varying(10) DEFAULT 'auto'::character varying NOT NULL,
    CONSTRAINT ck_campuses_abbreviation_charset CHECK (((abbreviation IS NULL) OR ((abbreviation)::text ~ '^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$'::text))),
    CONSTRAINT ck_campuses_naming_mode CHECK (((naming_mode)::text = ANY ((ARRAY['auto'::character varying, 'manual'::character varying])::text[])))
);


ALTER TABLE public.campuses OWNER TO vfcmdb;

--
-- Name: campuses_id_seq; Type: SEQUENCE; Schema: public; Owner: vfcmdb
--

CREATE SEQUENCE public.campuses_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.campuses_id_seq OWNER TO vfcmdb;

--
-- Name: campuses_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: vfcmdb
--

ALTER SEQUENCE public.campuses_id_seq OWNED BY public.campuses.id;


--
-- Name: change_log; Type: TABLE; Schema: public; Owner: vfcmdb
--

CREATE TABLE public.change_log (
    id integer NOT NULL,
    table_name character varying(60) NOT NULL,
    record_id integer,
    field_name character varying(80),
    old_value text,
    new_value text,
    changed_at timestamp with time zone DEFAULT now() NOT NULL,
    change_source character varying(30) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.change_log OWNER TO vfcmdb;

--
-- Name: change_log_id_seq; Type: SEQUENCE; Schema: public; Owner: vfcmdb
--

CREATE SEQUENCE public.change_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.change_log_id_seq OWNER TO vfcmdb;

--
-- Name: change_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: vfcmdb
--

ALTER SEQUENCE public.change_log_id_seq OWNED BY public.change_log.id;


--
-- Name: clouds; Type: TABLE; Schema: public; Owner: vfcmdb
--

CREATE TABLE public.clouds (
    id integer NOT NULL,
    full_name character varying(120) NOT NULL,
    abbreviation character varying(20) NOT NULL,
    max_length integer,
    description text,
    case_enforcement character varying(9) DEFAULT 'mixed'::character varying NOT NULL,
    trim_mode character varying(10) DEFAULT 'manual'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    icon character varying(60),
    logo_url character varying(500),
    CONSTRAINT ck_clouds_abbreviation_charset CHECK (((abbreviation IS NULL) OR ((abbreviation)::text ~ '^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$'::text)))
);


ALTER TABLE public.clouds OWNER TO vfcmdb;

--
-- Name: clouds_id_seq; Type: SEQUENCE; Schema: public; Owner: vfcmdb
--

CREATE SEQUENCE public.clouds_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.clouds_id_seq OWNER TO vfcmdb;

--
-- Name: clouds_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: vfcmdb
--

ALTER SEQUENCE public.clouds_id_seq OWNED BY public.clouds.id;


--
-- Name: cluster_types; Type: TABLE; Schema: public; Owner: vfcmdb
--

CREATE TABLE public.cluster_types (
    id integer NOT NULL,
    full_name character varying(120) NOT NULL,
    abbreviation character varying(20) NOT NULL,
    max_length integer,
    description text,
    case_enforcement character varying(9) DEFAULT 'mixed'::character varying NOT NULL,
    trim_mode character varying(10) DEFAULT 'manual'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    icon character varying(60),
    CONSTRAINT ck_cluster_types_abbreviation_charset CHECK (((abbreviation IS NULL) OR ((abbreviation)::text ~ '^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$'::text)))
);


ALTER TABLE public.cluster_types OWNER TO vfcmdb;

--
-- Name: cluster_types_id_seq; Type: SEQUENCE; Schema: public; Owner: vfcmdb
--

CREATE SEQUENCE public.cluster_types_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.cluster_types_id_seq OWNER TO vfcmdb;

--
-- Name: cluster_types_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: vfcmdb
--

ALTER SEQUENCE public.cluster_types_id_seq OWNED BY public.cluster_types.id;


--
-- Name: compute_device_types; Type: TABLE; Schema: public; Owner: vfcmdb
--

CREATE TABLE public.compute_device_types (
    stencil_url character varying(500),
    stencil_url_back character varying(500),
    icon character varying(60),
    id integer NOT NULL,
    full_name character varying(120) NOT NULL,
    abbreviation character varying(20) NOT NULL,
    max_length integer,
    description text,
    case_enforcement character varying(9) DEFAULT 'mixed'::character varying NOT NULL,
    trim_mode character varying(10) DEFAULT 'manual'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    rack_units integer,
    cpu_sockets integer,
    max_cpu_cores integer,
    max_memory_gb integer,
    drive_bays integer,
    max_power_watts integer,
    CONSTRAINT ck_compute_device_types_abbreviation_charset CHECK (((abbreviation IS NULL) OR ((abbreviation)::text ~ '^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$'::text)))
);


ALTER TABLE public.compute_device_types OWNER TO vfcmdb;

--
-- Name: compute_device_types_id_seq; Type: SEQUENCE; Schema: public; Owner: vfcmdb
--

CREATE SEQUENCE public.compute_device_types_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.compute_device_types_id_seq OWNER TO vfcmdb;

--
-- Name: compute_device_types_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: vfcmdb
--

ALTER SEQUENCE public.compute_device_types_id_seq OWNED BY public.compute_device_types.id;


--
-- Name: containers_apps; Type: TABLE; Schema: public; Owner: vfcmdb
--

CREATE TABLE public.containers_apps (
    id integer NOT NULL,
    host_vm_id integer,
    host_server_id integer,
    site_id integer,
    container_type character varying(10) NOT NULL,
    app_type_id integer,
    version character varying(30),
    role_id integer,
    consecutive integer,
    name_prefix character varying(40),
    sequence_number integer,
    vf_short_name character varying(120),
    friendly_name character varying(120),
    description text,
    ipv4_address inet,
    ipv6_address inet,
    notes text,
    ansible_facts jsonb,
    cpu_cores integer,
    memory_mb integer,
    os_distribution character varying(80),
    last_fact_sync_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    stencil_url character varying(500),
    stencil_url_back character varying(500),
    theme_name character varying(120),
    theme_category character varying(40)
);


ALTER TABLE public.containers_apps OWNER TO vfcmdb;

--
-- Name: containers_apps_id_seq; Type: SEQUENCE; Schema: public; Owner: vfcmdb
--

CREATE SEQUENCE public.containers_apps_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.containers_apps_id_seq OWNER TO vfcmdb;

--
-- Name: containers_apps_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: vfcmdb
--

ALTER SEQUENCE public.containers_apps_id_seq OWNED BY public.containers_apps.id;


--
-- Name: datacenter_floors; Type: TABLE; Schema: public; Owner: vfcmdb
--

CREATE TABLE public.datacenter_floors (
    id integer NOT NULL,
    name character varying(128) NOT NULL,
    code character varying(16),
    floor_number integer,
    datacenter_id integer,
    theme_name character varying(120),
    theme_category character varying(40),
    case_enforcement character varying(9) DEFAULT 'mixed'::character varying NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    blueprint_url character varying(500),
    naming_mode character varying(10) DEFAULT 'auto'::character varying NOT NULL,
    CONSTRAINT ck_datacenter_floors_code_charset CHECK (((code IS NULL) OR ((code)::text ~ '^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$'::text))),
    CONSTRAINT ck_datacenter_floors_naming_mode CHECK (((naming_mode)::text = ANY ((ARRAY['auto'::character varying, 'manual'::character varying])::text[])))
);


ALTER TABLE public.datacenter_floors OWNER TO vfcmdb;

--
-- Name: datacenter_floors_id_seq; Type: SEQUENCE; Schema: public; Owner: vfcmdb
--

CREATE SEQUENCE public.datacenter_floors_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.datacenter_floors_id_seq OWNER TO vfcmdb;

--
-- Name: datacenter_floors_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: vfcmdb
--

ALTER SEQUENCE public.datacenter_floors_id_seq OWNED BY public.datacenter_floors.id;


--
-- Name: datacenters; Type: TABLE; Schema: public; Owner: vfcmdb
--

CREATE TABLE public.datacenters (
    id integer NOT NULL,
    name character varying(128) NOT NULL,
    code character varying(16),
    description text,
    site_id integer,
    city character varying(120),
    iata_code character varying(10),
    vf_long_name character varying(200),
    case_enforcement character varying(9) DEFAULT 'mixed'::character varying NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    naming_mode character varying(10) DEFAULT 'auto'::character varying NOT NULL,
    theme_name character varying(120),
    theme_category character varying(40),
    CONSTRAINT ck_datacenters_code_charset CHECK (((code IS NULL) OR ((code)::text ~ '^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$'::text))),
    CONSTRAINT ck_datacenters_iata_code_charset CHECK (((iata_code IS NULL) OR ((iata_code)::text ~ '^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$'::text))),
    CONSTRAINT ck_datacenters_naming_mode CHECK (((naming_mode)::text = ANY ((ARRAY['auto'::character varying, 'manual'::character varying])::text[])))
);


ALTER TABLE public.datacenters OWNER TO vfcmdb;

--
-- Name: datacenters_id_seq; Type: SEQUENCE; Schema: public; Owner: vfcmdb
--

CREATE SEQUENCE public.datacenters_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.datacenters_id_seq OWNER TO vfcmdb;

--
-- Name: datacenters_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: vfcmdb
--

ALTER SEQUENCE public.datacenters_id_seq OWNED BY public.datacenters.id;


--
-- Name: device_interfaces; Type: TABLE; Schema: public; Owner: vfcmdb
--

CREATE TABLE public.device_interfaces (
    id integer NOT NULL,
    network_device_id integer,
    owner_device_type character varying(40),
    owner_device_id integer,
    port_number integer,
    port_mode character varying(20),
    portgroup character varying(60),
    aggregation_id character varying(60),
    pvid_vlan_id integer,
    description text,
    objective character varying(120),
    speed character varying(20),
    connected_device_type character varying(40),
    connected_device_id integer,
    connected_port character varying(40),
    admin_status character varying(10) NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.device_interfaces OWNER TO vfcmdb;

--
-- Name: device_interfaces_id_seq; Type: SEQUENCE; Schema: public; Owner: vfcmdb
--

CREATE SEQUENCE public.device_interfaces_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.device_interfaces_id_seq OWNER TO vfcmdb;

--
-- Name: device_interfaces_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: vfcmdb
--

ALTER SEQUENCE public.device_interfaces_id_seq OWNED BY public.device_interfaces.id;


--
-- Name: device_roles; Type: TABLE; Schema: public; Owner: vfcmdb
--

CREATE TABLE public.device_roles (
    id integer NOT NULL,
    full_name character varying(120) NOT NULL,
    abbreviation character varying(20) NOT NULL,
    max_length integer,
    description text,
    case_enforcement character varying(9) DEFAULT 'mixed'::character varying NOT NULL,
    trim_mode character varying(10) DEFAULT 'manual'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    icon character varying(60),
    CONSTRAINT ck_device_roles_abbreviation_charset CHECK (((abbreviation IS NULL) OR ((abbreviation)::text ~ '^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$'::text)))
);


ALTER TABLE public.device_roles OWNER TO vfcmdb;

--
-- Name: device_roles_id_seq; Type: SEQUENCE; Schema: public; Owner: vfcmdb
--

CREATE SEQUENCE public.device_roles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.device_roles_id_seq OWNER TO vfcmdb;

--
-- Name: device_roles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: vfcmdb
--

ALTER SEQUENCE public.device_roles_id_seq OWNED BY public.device_roles.id;


--
-- Name: entity_field_defs; Type: TABLE; Schema: public; Owner: vfcmdb
--

CREATE TABLE public.entity_field_defs (
    id integer NOT NULL,
    entity_type_id integer NOT NULL,
    key character varying(60) NOT NULL,
    label character varying(120) NOT NULL,
    field_type_id integer NOT NULL,
    required boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    reference_target_type character varying(60),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.entity_field_defs OWNER TO vfcmdb;

--
-- Name: entity_field_defs_id_seq; Type: SEQUENCE; Schema: public; Owner: vfcmdb
--

CREATE SEQUENCE public.entity_field_defs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.entity_field_defs_id_seq OWNER TO vfcmdb;

--
-- Name: entity_field_defs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: vfcmdb
--

ALTER SEQUENCE public.entity_field_defs_id_seq OWNED BY public.entity_field_defs.id;


--
-- Name: entity_type_defs; Type: TABLE; Schema: public; Owner: vfcmdb
--

CREATE TABLE public.entity_type_defs (
    id integer NOT NULL,
    slug character varying(60) NOT NULL,
    label character varying(120) NOT NULL,
    icon character varying(60),
    capabilities jsonb DEFAULT '[]'::jsonb NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.entity_type_defs OWNER TO vfcmdb;

--
-- Name: entity_type_defs_id_seq; Type: SEQUENCE; Schema: public; Owner: vfcmdb
--

CREATE SEQUENCE public.entity_type_defs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.entity_type_defs_id_seq OWNER TO vfcmdb;

--
-- Name: entity_type_defs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: vfcmdb
--

ALTER SEQUENCE public.entity_type_defs_id_seq OWNED BY public.entity_type_defs.id;


--
-- Name: field_type_defs; Type: TABLE; Schema: public; Owner: vfcmdb
--

CREATE TABLE public.field_type_defs (
    id integer NOT NULL,
    slug character varying(60) NOT NULL,
    label character varying(120) NOT NULL,
    storage_kind character varying(20) NOT NULL,
    builtin boolean DEFAULT false NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    icon character varying(60),
    CONSTRAINT field_type_def_storage_kind CHECK (((storage_kind)::text = ANY ((ARRAY['text'::character varying, 'number'::character varying, 'boolean'::character varying, 'date'::character varying, 'reference'::character varying, 'file'::character varying])::text[])))
);


ALTER TABLE public.field_type_defs OWNER TO vfcmdb;

--
-- Name: field_type_defs_id_seq; Type: SEQUENCE; Schema: public; Owner: vfcmdb
--

CREATE SEQUENCE public.field_type_defs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.field_type_defs_id_seq OWNER TO vfcmdb;

--
-- Name: field_type_defs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: vfcmdb
--

ALTER SEQUENCE public.field_type_defs_id_seq OWNED BY public.field_type_defs.id;


--
-- Name: field_visibility_overrides; Type: TABLE; Schema: public; Owner: vfcmdb
--

CREATE TABLE public.field_visibility_overrides (
    id integer NOT NULL,
    entity_slug character varying(60) NOT NULL,
    field_key character varying(80) NOT NULL,
    visible boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.field_visibility_overrides OWNER TO vfcmdb;

--
-- Name: field_visibility_overrides_id_seq; Type: SEQUENCE; Schema: public; Owner: vfcmdb
--

CREATE SEQUENCE public.field_visibility_overrides_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.field_visibility_overrides_id_seq OWNER TO vfcmdb;

--
-- Name: field_visibility_overrides_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: vfcmdb
--

ALTER SEQUENCE public.field_visibility_overrides_id_seq OWNED BY public.field_visibility_overrides.id;


--
-- Name: generic_entities; Type: TABLE; Schema: public; Owner: vfcmdb
--

CREATE TABLE public.generic_entities (
    id integer NOT NULL,
    entity_type_id integer NOT NULL,
    attributes jsonb DEFAULT '{}'::jsonb NOT NULL,
    rack_id integer,
    rack_unit integer,
    photo_url character varying(500),
    stencil_url character varying(500),
    stencil_url_back character varying(500),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    ip_id integer,
    management_ip_id integer,
    admin_username character varying(100),
    bw_secret_id character varying(64),
    semaphore_host_id character varying(64),
    ansible_facts jsonb,
    cpu_cores integer,
    memory_mb integer,
    os_distribution character varying(80),
    last_fact_sync_at timestamp with time zone
);


ALTER TABLE public.generic_entities OWNER TO vfcmdb;

--
-- Name: generic_entities_id_seq; Type: SEQUENCE; Schema: public; Owner: vfcmdb
--

CREATE SEQUENCE public.generic_entities_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.generic_entities_id_seq OWNER TO vfcmdb;

--
-- Name: generic_entities_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: vfcmdb
--

ALTER SEQUENCE public.generic_entities_id_seq OWNED BY public.generic_entities.id;


--
-- Name: interface_vlan_memberships; Type: TABLE; Schema: public; Owner: vfcmdb
--

CREATE TABLE public.interface_vlan_memberships (
    id integer NOT NULL,
    interface_id integer NOT NULL,
    vlan_id integer NOT NULL,
    tagged boolean NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.interface_vlan_memberships OWNER TO vfcmdb;

--
-- Name: interface_vlan_memberships_id_seq; Type: SEQUENCE; Schema: public; Owner: vfcmdb
--

CREATE SEQUENCE public.interface_vlan_memberships_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.interface_vlan_memberships_id_seq OWNER TO vfcmdb;

--
-- Name: interface_vlan_memberships_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: vfcmdb
--

ALTER SEQUENCE public.interface_vlan_memberships_id_seq OWNED BY public.interface_vlan_memberships.id;


--
-- Name: ip_assignments; Type: TABLE; Schema: public; Owner: vfcmdb
--

CREATE TABLE public.ip_assignments (
    id integer NOT NULL,
    subnet_ipv4_id integer,
    subnet_ipv6_id integer,
    ipv4_address inet,
    ipv6_address inet,
    assigned_to_type character varying(50),
    assigned_to_id integer,
    interface_name character varying(60),
    dns_name character varying(200),
    is_primary boolean NOT NULL,
    status character varying(20) NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    auto_generated boolean DEFAULT false NOT NULL
);


ALTER TABLE public.ip_assignments OWNER TO vfcmdb;

--
-- Name: ip_assignments_id_seq; Type: SEQUENCE; Schema: public; Owner: vfcmdb
--

CREATE SEQUENCE public.ip_assignments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.ip_assignments_id_seq OWNER TO vfcmdb;

--
-- Name: ip_assignments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: vfcmdb
--

ALTER SEQUENCE public.ip_assignments_id_seq OWNED BY public.ip_assignments.id;


--
-- Name: naming_floors; Type: TABLE; Schema: public; Owner: vfcmdb
--

CREATE TABLE public.naming_floors (
    id integer NOT NULL,
    full_name character varying(120) NOT NULL,
    abbreviation character varying(20) NOT NULL,
    max_length integer,
    description text,
    case_enforcement character varying(9) DEFAULT 'lowercase'::character varying NOT NULL,
    trim_mode character varying(10) DEFAULT 'consonants'::character varying NOT NULL,
    icon character varying(60),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_naming_floors_abbreviation_charset CHECK (((abbreviation IS NULL) OR ((abbreviation)::text ~ '^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$'::text)))
);


ALTER TABLE public.naming_floors OWNER TO vfcmdb;

--
-- Name: naming_floors_id_seq; Type: SEQUENCE; Schema: public; Owner: vfcmdb
--

CREATE SEQUENCE public.naming_floors_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.naming_floors_id_seq OWNER TO vfcmdb;

--
-- Name: naming_floors_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: vfcmdb
--

ALTER SEQUENCE public.naming_floors_id_seq OWNED BY public.naming_floors.id;


--
-- Name: naming_sections; Type: TABLE; Schema: public; Owner: vfcmdb
--

CREATE TABLE public.naming_sections (
    id integer NOT NULL,
    full_name character varying(120) NOT NULL,
    abbreviation character varying(20) NOT NULL,
    max_length integer,
    description text,
    case_enforcement character varying(9) DEFAULT 'lowercase'::character varying NOT NULL,
    trim_mode character varying(10) DEFAULT 'consonants'::character varying NOT NULL,
    icon character varying(60),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_naming_sections_abbreviation_charset CHECK (((abbreviation IS NULL) OR ((abbreviation)::text ~ '^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$'::text)))
);


ALTER TABLE public.naming_sections OWNER TO vfcmdb;

--
-- Name: naming_sections_id_seq; Type: SEQUENCE; Schema: public; Owner: vfcmdb
--

CREATE SEQUENCE public.naming_sections_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.naming_sections_id_seq OWNER TO vfcmdb;

--
-- Name: naming_sections_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: vfcmdb
--

ALTER SEQUENCE public.naming_sections_id_seq OWNED BY public.naming_sections.id;


--
-- Name: network_device_types; Type: TABLE; Schema: public; Owner: vfcmdb
--

CREATE TABLE public.network_device_types (
    stencil_url character varying(500),
    stencil_url_back character varying(500),
    icon character varying(60),
    id integer NOT NULL,
    full_name character varying(120) NOT NULL,
    abbreviation character varying(20) NOT NULL,
    max_length integer,
    description text,
    case_enforcement character varying(9) DEFAULT 'mixed'::character varying NOT NULL,
    trim_mode character varying(10) DEFAULT 'manual'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    rack_units integer,
    majority_port_count integer,
    majority_port_speed_gbps double precision,
    poe_supported boolean,
    max_power_watts integer,
    minority_port_count integer,
    minority_port_speed_gbps double precision,
    power_source_count integer,
    CONSTRAINT ck_network_device_types_abbreviation_charset CHECK (((abbreviation IS NULL) OR ((abbreviation)::text ~ '^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$'::text)))
);


ALTER TABLE public.network_device_types OWNER TO vfcmdb;

--
-- Name: network_device_types_id_seq; Type: SEQUENCE; Schema: public; Owner: vfcmdb
--

CREATE SEQUENCE public.network_device_types_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.network_device_types_id_seq OWNER TO vfcmdb;

--
-- Name: network_device_types_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: vfcmdb
--

ALTER SEQUENCE public.network_device_types_id_seq OWNED BY public.network_device_types.id;


--
-- Name: network_devices; Type: TABLE; Schema: public; Owner: vfcmdb
--

CREATE TABLE public.network_devices (
    id integer NOT NULL,
    site_id integer,
    rack_id integer,
    rack_unit integer,
    device_type_id integer,
    subtype_id integer,
    brand_id integer,
    model character varying(120),
    serial_number character varying(120),
    consecutive integer,
    name_prefix character varying(40),
    sequence_number integer,
    os_version character varying(60),
    description text,
    management_ipv4 inet,
    management_ipv6 inet,
    management_fqdn character varying(200),
    default_ip character varying(60),
    bitwarden_collection_ref character varying(120),
    vf_long_name character varying(200),
    alternative_name character varying(120),
    theme_name character varying(120),
    theme_category character varying(40),
    vf_friendly_name character varying(120),
    notes text,
    ansible_facts jsonb,
    cpu_cores integer,
    memory_mb integer,
    os_distribution character varying(80),
    last_fact_sync_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    photo_url character varying(500),
    stencil_url character varying(500),
    stencil_url_back character varying(500)
);


ALTER TABLE public.network_devices OWNER TO vfcmdb;

--
-- Name: network_devices_id_seq; Type: SEQUENCE; Schema: public; Owner: vfcmdb
--

CREATE SEQUENCE public.network_devices_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.network_devices_id_seq OWNER TO vfcmdb;

--
-- Name: network_devices_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: vfcmdb
--

ALTER SEQUENCE public.network_devices_id_seq OWNED BY public.network_devices.id;


--
-- Name: network_id_types; Type: TABLE; Schema: public; Owner: vfcmdb
--

CREATE TABLE public.network_id_types (
    id integer NOT NULL,
    full_name character varying(120) NOT NULL,
    abbreviation character varying(20) NOT NULL,
    max_length integer,
    description text,
    case_enforcement character varying(9) DEFAULT 'mixed'::character varying NOT NULL,
    trim_mode character varying(10) DEFAULT 'manual'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    icon character varying(60),
    CONSTRAINT ck_network_id_types_abbreviation_charset CHECK (((abbreviation IS NULL) OR ((abbreviation)::text ~ '^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$'::text)))
);


ALTER TABLE public.network_id_types OWNER TO vfcmdb;

--
-- Name: network_id_types_id_seq; Type: SEQUENCE; Schema: public; Owner: vfcmdb
--

CREATE SEQUENCE public.network_id_types_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.network_id_types_id_seq OWNER TO vfcmdb;

--
-- Name: network_id_types_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: vfcmdb
--

ALTER SEQUENCE public.network_id_types_id_seq OWNED BY public.network_id_types.id;


--
-- Name: network_subtypes; Type: TABLE; Schema: public; Owner: vfcmdb
--

CREATE TABLE public.network_subtypes (
    id integer NOT NULL,
    full_name character varying(120) NOT NULL,
    abbreviation character varying(20) NOT NULL,
    max_length integer,
    description text,
    case_enforcement character varying(9) DEFAULT 'mixed'::character varying NOT NULL,
    trim_mode character varying(10) DEFAULT 'manual'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    icon character varying(60),
    CONSTRAINT ck_network_subtypes_abbreviation_charset CHECK (((abbreviation IS NULL) OR ((abbreviation)::text ~ '^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$'::text)))
);


ALTER TABLE public.network_subtypes OWNER TO vfcmdb;

--
-- Name: network_subtypes_id_seq; Type: SEQUENCE; Schema: public; Owner: vfcmdb
--

CREATE SEQUENCE public.network_subtypes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.network_subtypes_id_seq OWNER TO vfcmdb;

--
-- Name: network_subtypes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: vfcmdb
--

ALTER SEQUENCE public.network_subtypes_id_seq OWNED BY public.network_subtypes.id;


--
-- Name: organizations; Type: TABLE; Schema: public; Owner: vfcmdb
--

CREATE TABLE public.organizations (
    id integer NOT NULL,
    full_name character varying(120) NOT NULL,
    abbreviation character varying(20) NOT NULL,
    max_length integer,
    description text,
    case_enforcement character varying(9) DEFAULT 'mixed'::character varying NOT NULL,
    trim_mode character varying(10) DEFAULT 'manual'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    icon character varying(60),
    CONSTRAINT ck_organizations_abbreviation_charset CHECK (((abbreviation IS NULL) OR ((abbreviation)::text ~ '^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$'::text)))
);


ALTER TABLE public.organizations OWNER TO vfcmdb;

--
-- Name: organizations_id_seq; Type: SEQUENCE; Schema: public; Owner: vfcmdb
--

CREATE SEQUENCE public.organizations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.organizations_id_seq OWNER TO vfcmdb;

--
-- Name: organizations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: vfcmdb
--

ALTER SEQUENCE public.organizations_id_seq OWNED BY public.organizations.id;


--
-- Name: os_families; Type: TABLE; Schema: public; Owner: vfcmdb
--

CREATE TABLE public.os_families (
    id integer NOT NULL,
    full_name character varying(120) NOT NULL,
    abbreviation character varying(20) NOT NULL,
    max_length integer,
    description text,
    case_enforcement character varying(9) DEFAULT 'mixed'::character varying NOT NULL,
    trim_mode character varying(10) DEFAULT 'manual'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    icon character varying(60),
    CONSTRAINT ck_os_families_abbreviation_charset CHECK (((abbreviation IS NULL) OR ((abbreviation)::text ~ '^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$'::text)))
);


ALTER TABLE public.os_families OWNER TO vfcmdb;

--
-- Name: os_families_id_seq; Type: SEQUENCE; Schema: public; Owner: vfcmdb
--

CREATE SEQUENCE public.os_families_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.os_families_id_seq OWNER TO vfcmdb;

--
-- Name: os_families_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: vfcmdb
--

ALTER SEQUENCE public.os_families_id_seq OWNED BY public.os_families.id;


--
-- Name: os_versions; Type: TABLE; Schema: public; Owner: vfcmdb
--

CREATE TABLE public.os_versions (
    id integer NOT NULL,
    full_name character varying(120) NOT NULL,
    abbreviation character varying(20) NOT NULL,
    max_length integer,
    description text,
    case_enforcement character varying(9) DEFAULT 'mixed'::character varying NOT NULL,
    trim_mode character varying(10) DEFAULT 'manual'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    icon character varying(60),
    CONSTRAINT ck_os_versions_abbreviation_charset CHECK (((abbreviation IS NULL) OR ((abbreviation)::text ~ '^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$'::text)))
);


ALTER TABLE public.os_versions OWNER TO vfcmdb;

--
-- Name: os_versions_id_seq; Type: SEQUENCE; Schema: public; Owner: vfcmdb
--

CREATE SEQUENCE public.os_versions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.os_versions_id_seq OWNER TO vfcmdb;

--
-- Name: os_versions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: vfcmdb
--

ALTER SEQUENCE public.os_versions_id_seq OWNED BY public.os_versions.id;


--
-- Name: patch_panel_ports; Type: TABLE; Schema: public; Owner: vfcmdb
--

CREATE TABLE public.patch_panel_ports (
    id integer NOT NULL,
    patch_panel_id integer NOT NULL,
    port_number integer NOT NULL,
    label character varying(120),
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    naming_mode character varying(10) DEFAULT 'auto'::character varying NOT NULL,
    CONSTRAINT ck_patch_panel_ports_naming_mode CHECK (((naming_mode)::text = ANY ((ARRAY['auto'::character varying, 'manual'::character varying])::text[])))
);


ALTER TABLE public.patch_panel_ports OWNER TO vfcmdb;

--
-- Name: patch_panel_ports_id_seq; Type: SEQUENCE; Schema: public; Owner: vfcmdb
--

CREATE SEQUENCE public.patch_panel_ports_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.patch_panel_ports_id_seq OWNER TO vfcmdb;

--
-- Name: patch_panel_ports_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: vfcmdb
--

ALTER SEQUENCE public.patch_panel_ports_id_seq OWNED BY public.patch_panel_ports.id;


--
-- Name: patch_panels; Type: TABLE; Schema: public; Owner: vfcmdb
--

CREATE TABLE public.patch_panels (
    id integer NOT NULL,
    rack_id integer,
    rack_unit integer,
    port_count integer NOT NULL,
    panel_id_label character varying(40),
    side character varying(10) NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    photo_url character varying(500),
    naming_mode character varying(10) DEFAULT 'auto'::character varying NOT NULL,
    stencil_url character varying(500),
    stencil_url_back character varying(500),
    theme_name character varying(120),
    theme_category character varying(40),
    CONSTRAINT ck_patch_panels_naming_mode CHECK (((naming_mode)::text = ANY ((ARRAY['auto'::character varying, 'manual'::character varying])::text[])))
);


ALTER TABLE public.patch_panels OWNER TO vfcmdb;

--
-- Name: patch_panels_id_seq; Type: SEQUENCE; Schema: public; Owner: vfcmdb
--

CREATE SEQUENCE public.patch_panels_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.patch_panels_id_seq OWNER TO vfcmdb;

--
-- Name: patch_panels_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: vfcmdb
--

ALTER SEQUENCE public.patch_panels_id_seq OWNED BY public.patch_panels.id;


--
-- Name: physical_servers; Type: TABLE; Schema: public; Owner: vfcmdb
--

CREATE TABLE public.physical_servers (
    id integer NOT NULL,
    site_id integer,
    rack_id integer,
    rack_unit integer,
    device_type_id integer,
    cluster_type_id integer,
    brand_id integer,
    model character varying(120),
    serial_number character varying(120),
    part_number character varying(120),
    role_id integer,
    os_family_id integer,
    os_version_id integer,
    consecutive integer,
    name_prefix character varying(40),
    sequence_number integer,
    vf_long_name character varying(200),
    vf_short_name character varying(120),
    alternative_name character varying(120),
    management_ipv4 inet,
    management_ipv6 inet,
    management_fqdn character varying(200),
    ilo_ipmi_ipv4 inet,
    ilo_ipmi_fqdn character varying(200),
    ilo_ipmi_user character varying(80),
    bitwarden_collection_ref character varying(120),
    domain character varying(120),
    bios_settings jsonb,
    notes text,
    ansible_facts jsonb,
    cpu_cores integer,
    memory_mb integer,
    os_distribution character varying(80),
    last_fact_sync_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    photo_url character varying(500),
    stencil_url character varying(500),
    stencil_url_back character varying(500),
    theme_name character varying(120),
    theme_category character varying(40)
);


ALTER TABLE public.physical_servers OWNER TO vfcmdb;

--
-- Name: physical_servers_id_seq; Type: SEQUENCE; Schema: public; Owner: vfcmdb
--

CREATE SEQUENCE public.physical_servers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.physical_servers_id_seq OWNER TO vfcmdb;

--
-- Name: physical_servers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: vfcmdb
--

ALTER SEQUENCE public.physical_servers_id_seq OWNED BY public.physical_servers.id;


--
-- Name: power_device_types; Type: TABLE; Schema: public; Owner: vfcmdb
--

CREATE TABLE public.power_device_types (
    stencil_url character varying(500),
    stencil_url_back character varying(500),
    icon character varying(60),
    id integer NOT NULL,
    full_name character varying(120) NOT NULL,
    abbreviation character varying(20) NOT NULL,
    max_length integer,
    description text,
    case_enforcement character varying(9) DEFAULT 'mixed'::character varying NOT NULL,
    trim_mode character varying(10) DEFAULT 'manual'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    rack_units integer,
    capacity_va integer,
    output_count integer,
    input_voltage character varying(20),
    CONSTRAINT ck_power_device_types_abbreviation_charset CHECK (((abbreviation IS NULL) OR ((abbreviation)::text ~ '^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$'::text)))
);


ALTER TABLE public.power_device_types OWNER TO vfcmdb;

--
-- Name: power_device_types_id_seq; Type: SEQUENCE; Schema: public; Owner: vfcmdb
--

CREATE SEQUENCE public.power_device_types_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.power_device_types_id_seq OWNER TO vfcmdb;

--
-- Name: power_device_types_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: vfcmdb
--

ALTER SEQUENCE public.power_device_types_id_seq OWNED BY public.power_device_types.id;


--
-- Name: power_devices; Type: TABLE; Schema: public; Owner: vfcmdb
--

CREATE TABLE public.power_devices (
    id integer NOT NULL,
    site_id integer,
    rack_id integer,
    device_type character varying(10) NOT NULL,
    device_type_id integer,
    device_number integer,
    brand character varying(80),
    model character varying(120),
    serial_number character varying(120),
    vf_long_name character varying(200),
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    photo_url character varying(500),
    naming_mode character varying(10) DEFAULT 'auto'::character varying NOT NULL,
    stencil_url character varying(500),
    stencil_url_back character varying(500),
    theme_name character varying(120),
    theme_category character varying(40),
    CONSTRAINT ck_power_devices_naming_mode CHECK (((naming_mode)::text = ANY ((ARRAY['auto'::character varying, 'manual'::character varying])::text[])))
);


ALTER TABLE public.power_devices OWNER TO vfcmdb;

--
-- Name: power_devices_id_seq; Type: SEQUENCE; Schema: public; Owner: vfcmdb
--

CREATE SEQUENCE public.power_devices_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.power_devices_id_seq OWNER TO vfcmdb;

--
-- Name: power_devices_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: vfcmdb
--

ALTER SEQUENCE public.power_devices_id_seq OWNED BY public.power_devices.id;


--
-- Name: power_outlets; Type: TABLE; Schema: public; Owner: vfcmdb
--

CREATE TABLE public.power_outlets (
    id integer NOT NULL,
    power_device_id integer,
    site_id integer,
    rack_id integer,
    wall_section character varying(40),
    port_number integer,
    outlet_type character varying(20),
    label character varying(120),
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    section_id integer,
    theme_name character varying(120),
    theme_category character varying(40),
    naming_mode character varying(10) DEFAULT 'auto'::character varying NOT NULL,
    CONSTRAINT ck_power_outlets_naming_mode CHECK (((naming_mode)::text = ANY ((ARRAY['auto'::character varying, 'manual'::character varying])::text[])))
);


ALTER TABLE public.power_outlets OWNER TO vfcmdb;

--
-- Name: power_outlets_id_seq; Type: SEQUENCE; Schema: public; Owner: vfcmdb
--

CREATE SEQUENCE public.power_outlets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.power_outlets_id_seq OWNER TO vfcmdb;

--
-- Name: power_outlets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: vfcmdb
--

ALTER SEQUENCE public.power_outlets_id_seq OWNED BY public.power_outlets.id;


--
-- Name: rack_types; Type: TABLE; Schema: public; Owner: vfcmdb
--

CREATE TABLE public.rack_types (
    id integer NOT NULL,
    name character varying(128) NOT NULL,
    code character varying(16),
    total_units integer NOT NULL,
    case_enforcement character varying(9) DEFAULT 'mixed'::character varying NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    icon character varying(60),
    CONSTRAINT ck_rack_types_code_charset CHECK (((code IS NULL) OR ((code)::text ~ '^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$'::text)))
);


ALTER TABLE public.rack_types OWNER TO vfcmdb;

--
-- Name: rack_types_id_seq; Type: SEQUENCE; Schema: public; Owner: vfcmdb
--

CREATE SEQUENCE public.rack_types_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.rack_types_id_seq OWNER TO vfcmdb;

--
-- Name: rack_types_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: vfcmdb
--

ALTER SEQUENCE public.rack_types_id_seq OWNED BY public.rack_types.id;


--
-- Name: rack_units; Type: TABLE; Schema: public; Owner: vfcmdb
--

CREATE TABLE public.rack_units (
    id integer NOT NULL,
    rack_id integer NOT NULL,
    unit_number integer NOT NULL,
    device_type character varying(20) NOT NULL,
    device_id integer,
    device_table character varying(50),
    label character varying(200),
    height_units integer NOT NULL,
    side character varying(10) NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.rack_units OWNER TO vfcmdb;

--
-- Name: rack_units_id_seq; Type: SEQUENCE; Schema: public; Owner: vfcmdb
--

CREATE SEQUENCE public.rack_units_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.rack_units_id_seq OWNER TO vfcmdb;

--
-- Name: rack_units_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: vfcmdb
--

ALTER SEQUENCE public.rack_units_id_seq OWNED BY public.rack_units.id;


--
-- Name: racks; Type: TABLE; Schema: public; Owner: vfcmdb
--

CREATE TABLE public.racks (
    id integer NOT NULL,
    site_id integer,
    datacenter_floor_id integer,
    room_id integer,
    rack_type_id integer,
    code character varying(16),
    grid_coordinates character varying(20),
    total_units integer NOT NULL,
    description text,
    vf_long_name character varying(200),
    simple_name character varying(120),
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    section_id integer,
    naming_mode character varying(10) DEFAULT 'auto'::character varying NOT NULL,
    stencil_url character varying(500),
    stencil_url_back character varying(500),
    theme_name character varying(120),
    theme_category character varying(40),
    CONSTRAINT ck_racks_code_charset CHECK (((code IS NULL) OR ((code)::text ~ '^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$'::text))),
    CONSTRAINT ck_racks_naming_mode CHECK (((naming_mode)::text = ANY ((ARRAY['auto'::character varying, 'manual'::character varying])::text[])))
);


ALTER TABLE public.racks OWNER TO vfcmdb;

--
-- Name: racks_id_seq; Type: SEQUENCE; Schema: public; Owner: vfcmdb
--

CREATE SEQUENCE public.racks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.racks_id_seq OWNER TO vfcmdb;

--
-- Name: racks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: vfcmdb
--

ALTER SEQUENCE public.racks_id_seq OWNED BY public.racks.id;


--
-- Name: regions; Type: TABLE; Schema: public; Owner: vfcmdb
--

CREATE TABLE public.regions (
    id integer NOT NULL,
    full_name character varying(120) NOT NULL,
    abbreviation character varying(20) NOT NULL,
    max_length integer,
    description text,
    case_enforcement character varying(9) DEFAULT 'mixed'::character varying NOT NULL,
    trim_mode character varying(10) DEFAULT 'manual'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    icon character varying(60),
    latitude double precision,
    longitude double precision,
    theme_name character varying(120),
    theme_category character varying(40),
    city character varying(120),
    airport_code character varying(10),
    CONSTRAINT ck_regions_abbreviation_charset CHECK (((abbreviation IS NULL) OR ((abbreviation)::text ~ '^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$'::text)))
);


ALTER TABLE public.regions OWNER TO vfcmdb;

--
-- Name: regions_id_seq; Type: SEQUENCE; Schema: public; Owner: vfcmdb
--

CREATE SEQUENCE public.regions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.regions_id_seq OWNER TO vfcmdb;

--
-- Name: regions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: vfcmdb
--

ALTER SEQUENCE public.regions_id_seq OWNED BY public.regions.id;


--
-- Name: rooms; Type: TABLE; Schema: public; Owner: vfcmdb
--

CREATE TABLE public.rooms (
    id integer NOT NULL,
    name character varying(128) NOT NULL,
    code character varying(16),
    datacenter_floor_id integer,
    theme_name character varying(120),
    theme_category character varying(40),
    case_enforcement character varying(9) DEFAULT 'mixed'::character varying NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    blueprint_url character varying(500),
    CONSTRAINT ck_rooms_code_charset CHECK (((code IS NULL) OR ((code)::text ~ '^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$'::text)))
);


ALTER TABLE public.rooms OWNER TO vfcmdb;

--
-- Name: rooms_id_seq; Type: SEQUENCE; Schema: public; Owner: vfcmdb
--

CREATE SEQUENCE public.rooms_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.rooms_id_seq OWNER TO vfcmdb;

--
-- Name: rooms_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: vfcmdb
--

ALTER SEQUENCE public.rooms_id_seq OWNED BY public.rooms.id;


--
-- Name: sections; Type: TABLE; Schema: public; Owner: vfcmdb
--

CREATE TABLE public.sections (
    id integer NOT NULL,
    name character varying(128) NOT NULL,
    code character varying(16),
    room_id integer NOT NULL,
    theme_name character varying(120),
    theme_category character varying(40),
    case_enforcement character varying(20) DEFAULT 'mixed'::character varying NOT NULL,
    description text,
    blueprint_url character varying(500),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    naming_mode character varying(10) DEFAULT 'auto'::character varying NOT NULL,
    CONSTRAINT ck_sections_case_enforcement CHECK (((case_enforcement)::text = ANY ((ARRAY['uppercase'::character varying, 'lowercase'::character varying, 'mixed'::character varying])::text[]))),
    CONSTRAINT ck_sections_code_charset CHECK (((code IS NULL) OR ((code)::text ~ '^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$'::text))),
    CONSTRAINT ck_sections_naming_mode CHECK (((naming_mode)::text = ANY ((ARRAY['auto'::character varying, 'manual'::character varying])::text[])))
);


ALTER TABLE public.sections OWNER TO vfcmdb;

--
-- Name: sections_id_seq; Type: SEQUENCE; Schema: public; Owner: vfcmdb
--

CREATE SEQUENCE public.sections_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.sections_id_seq OWNER TO vfcmdb;

--
-- Name: sections_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: vfcmdb
--

ALTER SEQUENCE public.sections_id_seq OWNED BY public.sections.id;


--
-- Name: site_addresses; Type: TABLE; Schema: public; Owner: vfcmdb
--

CREATE TABLE public.site_addresses (
    id integer NOT NULL,
    label character varying(120) NOT NULL,
    street character varying(200),
    city character varying(120),
    state_region character varying(120),
    postal_code character varying(40),
    country character varying(120),
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.site_addresses OWNER TO vfcmdb;

--
-- Name: site_addresses_id_seq; Type: SEQUENCE; Schema: public; Owner: vfcmdb
--

CREATE SEQUENCE public.site_addresses_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.site_addresses_id_seq OWNER TO vfcmdb;

--
-- Name: site_addresses_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: vfcmdb
--

ALTER SEQUENCE public.site_addresses_id_seq OWNED BY public.site_addresses.id;


--
-- Name: sites; Type: TABLE; Schema: public; Owner: vfcmdb
--

CREATE TABLE public.sites (
    id integer NOT NULL,
    description text,
    organization_id integer,
    cloud_id integer,
    region_id integer,
    campus_id integer,
    building_id integer,
    site_address_id integer,
    simple_name character varying(120),
    site_code_type character varying(6) DEFAULT 'auto'::character varying NOT NULL,
    theme_name character varying(120),
    theme_category character varying(40),
    vf_long_name character varying(200),
    vf_short_name character varying(120),
    tia606b_name character varying(200),
    custom_fields jsonb,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    naming_mode character varying(10) DEFAULT 'auto'::character varying NOT NULL,
    floor_id integer,
    section_id integer,
    CONSTRAINT ck_sites_naming_mode CHECK (((naming_mode)::text = ANY ((ARRAY['auto'::character varying, 'manual'::character varying])::text[]))),
    CONSTRAINT site_code_type CHECK (((site_code_type)::text = ANY ((ARRAY['auto'::character varying, 'custom'::character varying, 'theme'::character varying])::text[])))
);


ALTER TABLE public.sites OWNER TO vfcmdb;

--
-- Name: sites_id_seq; Type: SEQUENCE; Schema: public; Owner: vfcmdb
--

CREATE SEQUENCE public.sites_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.sites_id_seq OWNER TO vfcmdb;

--
-- Name: sites_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: vfcmdb
--

ALTER SEQUENCE public.sites_id_seq OWNED BY public.sites.id;


--
-- Name: stencil_anchors; Type: TABLE; Schema: public; Owner: vfcmdb
--

CREATE TABLE public.stencil_anchors (
    id integer NOT NULL,
    owner_resource character varying(40) NOT NULL,
    owner_id integer NOT NULL,
    face character varying(10) NOT NULL,
    port_key character varying(80) NOT NULL,
    x double precision NOT NULL,
    y double precision NOT NULL,
    label character varying(120),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.stencil_anchors OWNER TO vfcmdb;

--
-- Name: stencil_anchors_id_seq; Type: SEQUENCE; Schema: public; Owner: vfcmdb
--

CREATE SEQUENCE public.stencil_anchors_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.stencil_anchors_id_seq OWNER TO vfcmdb;

--
-- Name: stencil_anchors_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: vfcmdb
--

ALTER SEQUENCE public.stencil_anchors_id_seq OWNED BY public.stencil_anchors.id;


--
-- Name: storage_device_types; Type: TABLE; Schema: public; Owner: vfcmdb
--

CREATE TABLE public.storage_device_types (
    stencil_url character varying(500),
    stencil_url_back character varying(500),
    icon character varying(60),
    id integer NOT NULL,
    full_name character varying(120) NOT NULL,
    abbreviation character varying(20) NOT NULL,
    max_length integer,
    description text,
    case_enforcement character varying(9) DEFAULT 'mixed'::character varying NOT NULL,
    trim_mode character varying(10) DEFAULT 'manual'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    rack_units integer,
    capacity_tb double precision,
    drive_bays integer,
    interface_type character varying(40),
    max_power_watts integer,
    CONSTRAINT ck_storage_device_types_abbreviation_charset CHECK (((abbreviation IS NULL) OR ((abbreviation)::text ~ '^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$'::text)))
);


ALTER TABLE public.storage_device_types OWNER TO vfcmdb;

--
-- Name: storage_device_types_id_seq; Type: SEQUENCE; Schema: public; Owner: vfcmdb
--

CREATE SEQUENCE public.storage_device_types_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.storage_device_types_id_seq OWNER TO vfcmdb;

--
-- Name: storage_device_types_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: vfcmdb
--

ALTER SEQUENCE public.storage_device_types_id_seq OWNED BY public.storage_device_types.id;


--
-- Name: subnet_role_assignments; Type: TABLE; Schema: public; Owner: vfcmdb
--

CREATE TABLE public.subnet_role_assignments (
    id integer NOT NULL,
    subnet_ipv4_id integer,
    subnet_ipv6_id integer,
    role character varying(30) NOT NULL,
    slot_number integer,
    ipv4_address inet,
    ipv6_address inet,
    label character varying(80),
    is_locked boolean DEFAULT false NOT NULL,
    assigned_device_id integer,
    assigned_device_table character varying(50),
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.subnet_role_assignments OWNER TO vfcmdb;

--
-- Name: subnet_role_assignments_id_seq; Type: SEQUENCE; Schema: public; Owner: vfcmdb
--

CREATE SEQUENCE public.subnet_role_assignments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.subnet_role_assignments_id_seq OWNER TO vfcmdb;

--
-- Name: subnet_role_assignments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: vfcmdb
--

ALTER SEQUENCE public.subnet_role_assignments_id_seq OWNED BY public.subnet_role_assignments.id;


--
-- Name: subnets_ipv4; Type: TABLE; Schema: public; Owner: vfcmdb
--

CREATE TABLE public.subnets_ipv4 (
    id integer NOT NULL,
    vlan_id integer,
    site_id integer,
    network_cidr cidr,
    gateway inet,
    range_from inet,
    range_to inet,
    expansion_ceiling inet,
    reserved_count integer DEFAULT 0 NOT NULL,
    reservation_anchor character varying(10) DEFAULT 'from_end'::character varying NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.subnets_ipv4 OWNER TO vfcmdb;

--
-- Name: subnets_ipv4_id_seq; Type: SEQUENCE; Schema: public; Owner: vfcmdb
--

CREATE SEQUENCE public.subnets_ipv4_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.subnets_ipv4_id_seq OWNER TO vfcmdb;

--
-- Name: subnets_ipv4_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: vfcmdb
--

ALTER SEQUENCE public.subnets_ipv4_id_seq OWNED BY public.subnets_ipv4.id;


--
-- Name: subnets_ipv6; Type: TABLE; Schema: public; Owner: vfcmdb
--

CREATE TABLE public.subnets_ipv6 (
    id integer NOT NULL,
    vlan_id integer,
    site_id integer,
    network_cidr cidr,
    range_from inet,
    range_to inet,
    reserved_count integer DEFAULT 0 NOT NULL,
    reservation_anchor character varying(10) DEFAULT 'from_end'::character varying NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.subnets_ipv6 OWNER TO vfcmdb;

--
-- Name: subnets_ipv6_id_seq; Type: SEQUENCE; Schema: public; Owner: vfcmdb
--

CREATE SEQUENCE public.subnets_ipv6_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.subnets_ipv6_id_seq OWNER TO vfcmdb;

--
-- Name: subnets_ipv6_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: vfcmdb
--

ALTER SEQUENCE public.subnets_ipv6_id_seq OWNED BY public.subnets_ipv6.id;


--
-- Name: virtual_machines; Type: TABLE; Schema: public; Owner: vfcmdb
--

CREATE TABLE public.virtual_machines (
    id integer NOT NULL,
    host_server_id integer,
    site_id integer,
    cluster_type_id integer,
    os_family_id integer,
    os_version_id integer,
    role_id integer,
    consecutive integer,
    name_prefix character varying(40),
    sequence_number integer,
    vf_short_name character varying(120),
    friendly_name character varying(120),
    description text,
    management_ipv4 inet,
    management_ipv6 inet,
    management_fqdn character varying(200),
    notes text,
    ansible_facts jsonb,
    cpu_cores integer,
    memory_mb integer,
    os_distribution character varying(80),
    last_fact_sync_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    stencil_url character varying(500),
    stencil_url_back character varying(500),
    theme_name character varying(120),
    theme_category character varying(40)
);


ALTER TABLE public.virtual_machines OWNER TO vfcmdb;

--
-- Name: virtual_machines_id_seq; Type: SEQUENCE; Schema: public; Owner: vfcmdb
--

CREATE SEQUENCE public.virtual_machines_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.virtual_machines_id_seq OWNER TO vfcmdb;

--
-- Name: virtual_machines_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: vfcmdb
--

ALTER SEQUENCE public.virtual_machines_id_seq OWNED BY public.virtual_machines.id;


--
-- Name: vlans; Type: TABLE; Schema: public; Owner: vfcmdb
--

CREATE TABLE public.vlans (
    id integer NOT NULL,
    vlan_id integer,
    name character varying(120),
    description text,
    zone character varying(20),
    site_id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.vlans OWNER TO vfcmdb;

--
-- Name: vlans_id_seq; Type: SEQUENCE; Schema: public; Owner: vfcmdb
--

CREATE SEQUENCE public.vlans_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.vlans_id_seq OWNER TO vfcmdb;

--
-- Name: vlans_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: vfcmdb
--

ALTER SEQUENCE public.vlans_id_seq OWNED BY public.vlans.id;


--
-- Name: workstations; Type: TABLE; Schema: public; Owner: vfcmdb
--

CREATE TABLE public.workstations (
    id integer NOT NULL,
    site_id integer,
    device_type_id integer,
    brand_id integer,
    serial_number character varying(120),
    role_id integer,
    os_family_id integer,
    os_version_id integer,
    consecutive integer,
    name_prefix character varying(40),
    sequence_number integer,
    vf_long_name character varying(200),
    vf_short_name character varying(120),
    alternative_name character varying(120),
    management_ipv4 inet,
    management_fqdn character varying(200),
    bitwarden_collection_ref character varying(120),
    notes text,
    ansible_facts jsonb,
    cpu_cores integer,
    memory_mb integer,
    os_distribution character varying(80),
    last_fact_sync_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    photo_url character varying(500),
    stencil_url character varying(500),
    stencil_url_back character varying(500),
    theme_name character varying(120),
    theme_category character varying(40)
);


ALTER TABLE public.workstations OWNER TO vfcmdb;

--
-- Name: workstations_id_seq; Type: SEQUENCE; Schema: public; Owner: vfcmdb
--

CREATE SEQUENCE public.workstations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.workstations_id_seq OWNER TO vfcmdb;

--
-- Name: workstations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: vfcmdb
--

ALTER SEQUENCE public.workstations_id_seq OWNED BY public.workstations.id;


--
-- Name: abbreviation_registry id; Type: DEFAULT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.abbreviation_registry ALTER COLUMN id SET DEFAULT nextval('public.abbreviation_registry_id_seq'::regclass);


--
-- Name: app_types id; Type: DEFAULT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.app_types ALTER COLUMN id SET DEFAULT nextval('public.app_types_id_seq'::regclass);


--
-- Name: brands id; Type: DEFAULT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.brands ALTER COLUMN id SET DEFAULT nextval('public.brands_id_seq'::regclass);


--
-- Name: buildings id; Type: DEFAULT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.buildings ALTER COLUMN id SET DEFAULT nextval('public.buildings_id_seq'::regclass);


--
-- Name: cables id; Type: DEFAULT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.cables ALTER COLUMN id SET DEFAULT nextval('public.cables_id_seq'::regclass);


--
-- Name: campuses id; Type: DEFAULT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.campuses ALTER COLUMN id SET DEFAULT nextval('public.campuses_id_seq'::regclass);


--
-- Name: change_log id; Type: DEFAULT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.change_log ALTER COLUMN id SET DEFAULT nextval('public.change_log_id_seq'::regclass);


--
-- Name: clouds id; Type: DEFAULT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.clouds ALTER COLUMN id SET DEFAULT nextval('public.clouds_id_seq'::regclass);


--
-- Name: cluster_types id; Type: DEFAULT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.cluster_types ALTER COLUMN id SET DEFAULT nextval('public.cluster_types_id_seq'::regclass);


--
-- Name: compute_device_types id; Type: DEFAULT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.compute_device_types ALTER COLUMN id SET DEFAULT nextval('public.compute_device_types_id_seq'::regclass);


--
-- Name: containers_apps id; Type: DEFAULT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.containers_apps ALTER COLUMN id SET DEFAULT nextval('public.containers_apps_id_seq'::regclass);


--
-- Name: datacenter_floors id; Type: DEFAULT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.datacenter_floors ALTER COLUMN id SET DEFAULT nextval('public.datacenter_floors_id_seq'::regclass);


--
-- Name: datacenters id; Type: DEFAULT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.datacenters ALTER COLUMN id SET DEFAULT nextval('public.datacenters_id_seq'::regclass);


--
-- Name: device_interfaces id; Type: DEFAULT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.device_interfaces ALTER COLUMN id SET DEFAULT nextval('public.device_interfaces_id_seq'::regclass);


--
-- Name: device_roles id; Type: DEFAULT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.device_roles ALTER COLUMN id SET DEFAULT nextval('public.device_roles_id_seq'::regclass);


--
-- Name: entity_field_defs id; Type: DEFAULT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.entity_field_defs ALTER COLUMN id SET DEFAULT nextval('public.entity_field_defs_id_seq'::regclass);


--
-- Name: entity_type_defs id; Type: DEFAULT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.entity_type_defs ALTER COLUMN id SET DEFAULT nextval('public.entity_type_defs_id_seq'::regclass);


--
-- Name: field_type_defs id; Type: DEFAULT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.field_type_defs ALTER COLUMN id SET DEFAULT nextval('public.field_type_defs_id_seq'::regclass);


--
-- Name: field_visibility_overrides id; Type: DEFAULT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.field_visibility_overrides ALTER COLUMN id SET DEFAULT nextval('public.field_visibility_overrides_id_seq'::regclass);


--
-- Name: generic_entities id; Type: DEFAULT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.generic_entities ALTER COLUMN id SET DEFAULT nextval('public.generic_entities_id_seq'::regclass);


--
-- Name: interface_vlan_memberships id; Type: DEFAULT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.interface_vlan_memberships ALTER COLUMN id SET DEFAULT nextval('public.interface_vlan_memberships_id_seq'::regclass);


--
-- Name: ip_assignments id; Type: DEFAULT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.ip_assignments ALTER COLUMN id SET DEFAULT nextval('public.ip_assignments_id_seq'::regclass);


--
-- Name: naming_floors id; Type: DEFAULT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.naming_floors ALTER COLUMN id SET DEFAULT nextval('public.naming_floors_id_seq'::regclass);


--
-- Name: naming_sections id; Type: DEFAULT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.naming_sections ALTER COLUMN id SET DEFAULT nextval('public.naming_sections_id_seq'::regclass);


--
-- Name: network_device_types id; Type: DEFAULT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.network_device_types ALTER COLUMN id SET DEFAULT nextval('public.network_device_types_id_seq'::regclass);


--
-- Name: network_devices id; Type: DEFAULT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.network_devices ALTER COLUMN id SET DEFAULT nextval('public.network_devices_id_seq'::regclass);


--
-- Name: network_id_types id; Type: DEFAULT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.network_id_types ALTER COLUMN id SET DEFAULT nextval('public.network_id_types_id_seq'::regclass);


--
-- Name: network_subtypes id; Type: DEFAULT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.network_subtypes ALTER COLUMN id SET DEFAULT nextval('public.network_subtypes_id_seq'::regclass);


--
-- Name: organizations id; Type: DEFAULT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.organizations ALTER COLUMN id SET DEFAULT nextval('public.organizations_id_seq'::regclass);


--
-- Name: os_families id; Type: DEFAULT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.os_families ALTER COLUMN id SET DEFAULT nextval('public.os_families_id_seq'::regclass);


--
-- Name: os_versions id; Type: DEFAULT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.os_versions ALTER COLUMN id SET DEFAULT nextval('public.os_versions_id_seq'::regclass);


--
-- Name: patch_panel_ports id; Type: DEFAULT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.patch_panel_ports ALTER COLUMN id SET DEFAULT nextval('public.patch_panel_ports_id_seq'::regclass);


--
-- Name: patch_panels id; Type: DEFAULT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.patch_panels ALTER COLUMN id SET DEFAULT nextval('public.patch_panels_id_seq'::regclass);


--
-- Name: physical_servers id; Type: DEFAULT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.physical_servers ALTER COLUMN id SET DEFAULT nextval('public.physical_servers_id_seq'::regclass);


--
-- Name: power_device_types id; Type: DEFAULT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.power_device_types ALTER COLUMN id SET DEFAULT nextval('public.power_device_types_id_seq'::regclass);


--
-- Name: power_devices id; Type: DEFAULT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.power_devices ALTER COLUMN id SET DEFAULT nextval('public.power_devices_id_seq'::regclass);


--
-- Name: power_outlets id; Type: DEFAULT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.power_outlets ALTER COLUMN id SET DEFAULT nextval('public.power_outlets_id_seq'::regclass);


--
-- Name: rack_types id; Type: DEFAULT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.rack_types ALTER COLUMN id SET DEFAULT nextval('public.rack_types_id_seq'::regclass);


--
-- Name: rack_units id; Type: DEFAULT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.rack_units ALTER COLUMN id SET DEFAULT nextval('public.rack_units_id_seq'::regclass);


--
-- Name: racks id; Type: DEFAULT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.racks ALTER COLUMN id SET DEFAULT nextval('public.racks_id_seq'::regclass);


--
-- Name: regions id; Type: DEFAULT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.regions ALTER COLUMN id SET DEFAULT nextval('public.regions_id_seq'::regclass);


--
-- Name: rooms id; Type: DEFAULT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.rooms ALTER COLUMN id SET DEFAULT nextval('public.rooms_id_seq'::regclass);


--
-- Name: sections id; Type: DEFAULT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.sections ALTER COLUMN id SET DEFAULT nextval('public.sections_id_seq'::regclass);


--
-- Name: site_addresses id; Type: DEFAULT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.site_addresses ALTER COLUMN id SET DEFAULT nextval('public.site_addresses_id_seq'::regclass);


--
-- Name: sites id; Type: DEFAULT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.sites ALTER COLUMN id SET DEFAULT nextval('public.sites_id_seq'::regclass);


--
-- Name: stencil_anchors id; Type: DEFAULT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.stencil_anchors ALTER COLUMN id SET DEFAULT nextval('public.stencil_anchors_id_seq'::regclass);


--
-- Name: storage_device_types id; Type: DEFAULT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.storage_device_types ALTER COLUMN id SET DEFAULT nextval('public.storage_device_types_id_seq'::regclass);


--
-- Name: subnet_role_assignments id; Type: DEFAULT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.subnet_role_assignments ALTER COLUMN id SET DEFAULT nextval('public.subnet_role_assignments_id_seq'::regclass);


--
-- Name: subnets_ipv4 id; Type: DEFAULT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.subnets_ipv4 ALTER COLUMN id SET DEFAULT nextval('public.subnets_ipv4_id_seq'::regclass);


--
-- Name: subnets_ipv6 id; Type: DEFAULT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.subnets_ipv6 ALTER COLUMN id SET DEFAULT nextval('public.subnets_ipv6_id_seq'::regclass);


--
-- Name: virtual_machines id; Type: DEFAULT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.virtual_machines ALTER COLUMN id SET DEFAULT nextval('public.virtual_machines_id_seq'::regclass);


--
-- Name: vlans id; Type: DEFAULT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.vlans ALTER COLUMN id SET DEFAULT nextval('public.vlans_id_seq'::regclass);


--
-- Name: workstations id; Type: DEFAULT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.workstations ALTER COLUMN id SET DEFAULT nextval('public.workstations_id_seq'::regclass);


--
-- Name: abbreviation_registry abbreviation_registry_pkey; Type: CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.abbreviation_registry
    ADD CONSTRAINT abbreviation_registry_pkey PRIMARY KEY (id);


--
-- Name: alembic_version alembic_version_pkc; Type: CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.alembic_version
    ADD CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num);


--
-- Name: app_types app_types_pkey; Type: CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.app_types
    ADD CONSTRAINT app_types_pkey PRIMARY KEY (id);


--
-- Name: brands brands_pkey; Type: CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.brands
    ADD CONSTRAINT brands_pkey PRIMARY KEY (id);


--
-- Name: buildings buildings_pkey; Type: CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.buildings
    ADD CONSTRAINT buildings_pkey PRIMARY KEY (id);


--
-- Name: cables cables_pkey; Type: CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.cables
    ADD CONSTRAINT cables_pkey PRIMARY KEY (id);


--
-- Name: campuses campuses_pkey; Type: CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.campuses
    ADD CONSTRAINT campuses_pkey PRIMARY KEY (id);


--
-- Name: change_log change_log_pkey; Type: CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.change_log
    ADD CONSTRAINT change_log_pkey PRIMARY KEY (id);


--
-- Name: clouds clouds_pkey; Type: CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.clouds
    ADD CONSTRAINT clouds_pkey PRIMARY KEY (id);


--
-- Name: cluster_types cluster_types_pkey; Type: CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.cluster_types
    ADD CONSTRAINT cluster_types_pkey PRIMARY KEY (id);


--
-- Name: compute_device_types compute_device_types_pkey; Type: CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.compute_device_types
    ADD CONSTRAINT compute_device_types_pkey PRIMARY KEY (id);


--
-- Name: containers_apps containers_apps_pkey; Type: CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.containers_apps
    ADD CONSTRAINT containers_apps_pkey PRIMARY KEY (id);


--
-- Name: datacenter_floors datacenter_floors_pkey; Type: CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.datacenter_floors
    ADD CONSTRAINT datacenter_floors_pkey PRIMARY KEY (id);


--
-- Name: datacenters datacenters_pkey; Type: CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.datacenters
    ADD CONSTRAINT datacenters_pkey PRIMARY KEY (id);


--
-- Name: device_interfaces device_interfaces_pkey; Type: CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.device_interfaces
    ADD CONSTRAINT device_interfaces_pkey PRIMARY KEY (id);


--
-- Name: device_roles device_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.device_roles
    ADD CONSTRAINT device_roles_pkey PRIMARY KEY (id);


--
-- Name: entity_field_defs entity_field_defs_pkey; Type: CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.entity_field_defs
    ADD CONSTRAINT entity_field_defs_pkey PRIMARY KEY (id);


--
-- Name: entity_type_defs entity_type_defs_pkey; Type: CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.entity_type_defs
    ADD CONSTRAINT entity_type_defs_pkey PRIMARY KEY (id);


--
-- Name: field_type_defs field_type_defs_pkey; Type: CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.field_type_defs
    ADD CONSTRAINT field_type_defs_pkey PRIMARY KEY (id);


--
-- Name: field_visibility_overrides field_visibility_overrides_pkey; Type: CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.field_visibility_overrides
    ADD CONSTRAINT field_visibility_overrides_pkey PRIMARY KEY (id);


--
-- Name: generic_entities generic_entities_pkey; Type: CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.generic_entities
    ADD CONSTRAINT generic_entities_pkey PRIMARY KEY (id);


--
-- Name: interface_vlan_memberships interface_vlan_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.interface_vlan_memberships
    ADD CONSTRAINT interface_vlan_memberships_pkey PRIMARY KEY (id);


--
-- Name: ip_assignments ip_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.ip_assignments
    ADD CONSTRAINT ip_assignments_pkey PRIMARY KEY (id);


--
-- Name: naming_floors naming_floors_pkey; Type: CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.naming_floors
    ADD CONSTRAINT naming_floors_pkey PRIMARY KEY (id);


--
-- Name: naming_sections naming_sections_pkey; Type: CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.naming_sections
    ADD CONSTRAINT naming_sections_pkey PRIMARY KEY (id);


--
-- Name: network_device_types network_device_types_pkey; Type: CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.network_device_types
    ADD CONSTRAINT network_device_types_pkey PRIMARY KEY (id);


--
-- Name: network_devices network_devices_pkey; Type: CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.network_devices
    ADD CONSTRAINT network_devices_pkey PRIMARY KEY (id);


--
-- Name: network_id_types network_id_types_pkey; Type: CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.network_id_types
    ADD CONSTRAINT network_id_types_pkey PRIMARY KEY (id);


--
-- Name: network_subtypes network_subtypes_pkey; Type: CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.network_subtypes
    ADD CONSTRAINT network_subtypes_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);


--
-- Name: os_families os_families_pkey; Type: CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.os_families
    ADD CONSTRAINT os_families_pkey PRIMARY KEY (id);


--
-- Name: os_versions os_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.os_versions
    ADD CONSTRAINT os_versions_pkey PRIMARY KEY (id);


--
-- Name: patch_panel_ports patch_panel_ports_pkey; Type: CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.patch_panel_ports
    ADD CONSTRAINT patch_panel_ports_pkey PRIMARY KEY (id);


--
-- Name: patch_panels patch_panels_pkey; Type: CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.patch_panels
    ADD CONSTRAINT patch_panels_pkey PRIMARY KEY (id);


--
-- Name: physical_servers physical_servers_pkey; Type: CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.physical_servers
    ADD CONSTRAINT physical_servers_pkey PRIMARY KEY (id);


--
-- Name: power_device_types power_device_types_pkey; Type: CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.power_device_types
    ADD CONSTRAINT power_device_types_pkey PRIMARY KEY (id);


--
-- Name: power_devices power_devices_pkey; Type: CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.power_devices
    ADD CONSTRAINT power_devices_pkey PRIMARY KEY (id);


--
-- Name: power_outlets power_outlets_pkey; Type: CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.power_outlets
    ADD CONSTRAINT power_outlets_pkey PRIMARY KEY (id);


--
-- Name: rack_types rack_types_pkey; Type: CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.rack_types
    ADD CONSTRAINT rack_types_pkey PRIMARY KEY (id);


--
-- Name: rack_units rack_units_pkey; Type: CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.rack_units
    ADD CONSTRAINT rack_units_pkey PRIMARY KEY (id);


--
-- Name: racks racks_pkey; Type: CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.racks
    ADD CONSTRAINT racks_pkey PRIMARY KEY (id);


--
-- Name: regions regions_pkey; Type: CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.regions
    ADD CONSTRAINT regions_pkey PRIMARY KEY (id);


--
-- Name: rooms rooms_pkey; Type: CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.rooms
    ADD CONSTRAINT rooms_pkey PRIMARY KEY (id);


--
-- Name: sections sections_pkey; Type: CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.sections
    ADD CONSTRAINT sections_pkey PRIMARY KEY (id);


--
-- Name: site_addresses site_addresses_pkey; Type: CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.site_addresses
    ADD CONSTRAINT site_addresses_pkey PRIMARY KEY (id);


--
-- Name: sites sites_pkey; Type: CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.sites
    ADD CONSTRAINT sites_pkey PRIMARY KEY (id);


--
-- Name: stencil_anchors stencil_anchors_pkey; Type: CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.stencil_anchors
    ADD CONSTRAINT stencil_anchors_pkey PRIMARY KEY (id);


--
-- Name: storage_device_types storage_device_types_pkey; Type: CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.storage_device_types
    ADD CONSTRAINT storage_device_types_pkey PRIMARY KEY (id);


--
-- Name: subnet_role_assignments subnet_role_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.subnet_role_assignments
    ADD CONSTRAINT subnet_role_assignments_pkey PRIMARY KEY (id);


--
-- Name: subnets_ipv4 subnets_ipv4_pkey; Type: CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.subnets_ipv4
    ADD CONSTRAINT subnets_ipv4_pkey PRIMARY KEY (id);


--
-- Name: subnets_ipv6 subnets_ipv6_pkey; Type: CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.subnets_ipv6
    ADD CONSTRAINT subnets_ipv6_pkey PRIMARY KEY (id);


--
-- Name: entity_field_defs uq_entity_field_defs_entity_type_key; Type: CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.entity_field_defs
    ADD CONSTRAINT uq_entity_field_defs_entity_type_key UNIQUE (entity_type_id, key);


--
-- Name: entity_type_defs uq_entity_type_defs_slug; Type: CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.entity_type_defs
    ADD CONSTRAINT uq_entity_type_defs_slug UNIQUE (slug);


--
-- Name: field_type_defs uq_field_type_defs_slug; Type: CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.field_type_defs
    ADD CONSTRAINT uq_field_type_defs_slug UNIQUE (slug);


--
-- Name: field_visibility_overrides uq_field_visibility_overrides_entity_field; Type: CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.field_visibility_overrides
    ADD CONSTRAINT uq_field_visibility_overrides_entity_field UNIQUE (entity_slug, field_key);


--
-- Name: stencil_anchors uq_stencil_anchor_owner_face_port; Type: CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.stencil_anchors
    ADD CONSTRAINT uq_stencil_anchor_owner_face_port UNIQUE (owner_resource, owner_id, face, port_key);


--
-- Name: vlans uq_vlan_site_vlanid; Type: CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.vlans
    ADD CONSTRAINT uq_vlan_site_vlanid UNIQUE (site_id, vlan_id);


--
-- Name: virtual_machines virtual_machines_pkey; Type: CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.virtual_machines
    ADD CONSTRAINT virtual_machines_pkey PRIMARY KEY (id);


--
-- Name: vlans vlans_pkey; Type: CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.vlans
    ADD CONSTRAINT vlans_pkey PRIMARY KEY (id);


--
-- Name: vlans vlans_vlan_id_key; Type: CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.vlans
    ADD CONSTRAINT vlans_vlan_id_key UNIQUE (vlan_id);


--
-- Name: workstations workstations_pkey; Type: CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.workstations
    ADD CONSTRAINT workstations_pkey PRIMARY KEY (id);


--
-- Name: ix_generic_entities_attributes_gin; Type: INDEX; Schema: public; Owner: vfcmdb
--

CREATE INDEX ix_generic_entities_attributes_gin ON public.generic_entities USING gin (attributes);


--
-- Name: uq_abbreviation_registry_lower; Type: INDEX; Schema: public; Owner: vfcmdb
--

CREATE UNIQUE INDEX uq_abbreviation_registry_lower ON public.abbreviation_registry USING btree (lower((abbreviation)::text));


--
-- Name: buildings buildings_campus_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.buildings
    ADD CONSTRAINT buildings_campus_id_fkey FOREIGN KEY (campus_id) REFERENCES public.campuses(id);


--
-- Name: campuses campuses_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.campuses
    ADD CONSTRAINT campuses_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: campuses campuses_region_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.campuses
    ADD CONSTRAINT campuses_region_id_fkey FOREIGN KEY (region_id) REFERENCES public.regions(id);


--
-- Name: containers_apps containers_apps_app_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.containers_apps
    ADD CONSTRAINT containers_apps_app_type_id_fkey FOREIGN KEY (app_type_id) REFERENCES public.app_types(id);


--
-- Name: containers_apps containers_apps_host_server_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.containers_apps
    ADD CONSTRAINT containers_apps_host_server_id_fkey FOREIGN KEY (host_server_id) REFERENCES public.physical_servers(id);


--
-- Name: containers_apps containers_apps_host_vm_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.containers_apps
    ADD CONSTRAINT containers_apps_host_vm_id_fkey FOREIGN KEY (host_vm_id) REFERENCES public.virtual_machines(id);


--
-- Name: containers_apps containers_apps_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.containers_apps
    ADD CONSTRAINT containers_apps_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.device_roles(id);


--
-- Name: containers_apps containers_apps_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.containers_apps
    ADD CONSTRAINT containers_apps_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id);


--
-- Name: datacenter_floors datacenter_floors_datacenter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.datacenter_floors
    ADD CONSTRAINT datacenter_floors_datacenter_id_fkey FOREIGN KEY (datacenter_id) REFERENCES public.datacenters(id);


--
-- Name: datacenters datacenters_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.datacenters
    ADD CONSTRAINT datacenters_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id);


--
-- Name: device_interfaces device_interfaces_network_device_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.device_interfaces
    ADD CONSTRAINT device_interfaces_network_device_id_fkey FOREIGN KEY (network_device_id) REFERENCES public.network_devices(id);


--
-- Name: device_interfaces device_interfaces_pvid_vlan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.device_interfaces
    ADD CONSTRAINT device_interfaces_pvid_vlan_id_fkey FOREIGN KEY (pvid_vlan_id) REFERENCES public.vlans(id);


--
-- Name: entity_field_defs entity_field_defs_entity_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.entity_field_defs
    ADD CONSTRAINT entity_field_defs_entity_type_id_fkey FOREIGN KEY (entity_type_id) REFERENCES public.entity_type_defs(id);


--
-- Name: entity_field_defs entity_field_defs_field_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.entity_field_defs
    ADD CONSTRAINT entity_field_defs_field_type_id_fkey FOREIGN KEY (field_type_id) REFERENCES public.field_type_defs(id);


--
-- Name: campuses fk_campuses_tia606b_field_id_naming_sections; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.campuses
    ADD CONSTRAINT fk_campuses_tia606b_field_id_naming_sections FOREIGN KEY (tia606b_field_id) REFERENCES public.naming_sections(id);


--
-- Name: generic_entities fk_generic_entities_ip_id_ip_assignments; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.generic_entities
    ADD CONSTRAINT fk_generic_entities_ip_id_ip_assignments FOREIGN KEY (ip_id) REFERENCES public.ip_assignments(id);


--
-- Name: generic_entities fk_generic_entities_management_ip_id_ip_assignments; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.generic_entities
    ADD CONSTRAINT fk_generic_entities_management_ip_id_ip_assignments FOREIGN KEY (management_ip_id) REFERENCES public.ip_assignments(id);


--
-- Name: generic_entities generic_entities_entity_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.generic_entities
    ADD CONSTRAINT generic_entities_entity_type_id_fkey FOREIGN KEY (entity_type_id) REFERENCES public.entity_type_defs(id);


--
-- Name: generic_entities generic_entities_rack_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.generic_entities
    ADD CONSTRAINT generic_entities_rack_id_fkey FOREIGN KEY (rack_id) REFERENCES public.racks(id);


--
-- Name: interface_vlan_memberships interface_vlan_memberships_interface_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.interface_vlan_memberships
    ADD CONSTRAINT interface_vlan_memberships_interface_id_fkey FOREIGN KEY (interface_id) REFERENCES public.device_interfaces(id);


--
-- Name: interface_vlan_memberships interface_vlan_memberships_vlan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.interface_vlan_memberships
    ADD CONSTRAINT interface_vlan_memberships_vlan_id_fkey FOREIGN KEY (vlan_id) REFERENCES public.vlans(id);


--
-- Name: ip_assignments ip_assignments_subnet_ipv4_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.ip_assignments
    ADD CONSTRAINT ip_assignments_subnet_ipv4_id_fkey FOREIGN KEY (subnet_ipv4_id) REFERENCES public.subnets_ipv4(id);


--
-- Name: ip_assignments ip_assignments_subnet_ipv6_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.ip_assignments
    ADD CONSTRAINT ip_assignments_subnet_ipv6_id_fkey FOREIGN KEY (subnet_ipv6_id) REFERENCES public.subnets_ipv6(id);


--
-- Name: network_devices network_devices_brand_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.network_devices
    ADD CONSTRAINT network_devices_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id);


--
-- Name: network_devices network_devices_device_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.network_devices
    ADD CONSTRAINT network_devices_device_type_id_fkey FOREIGN KEY (device_type_id) REFERENCES public.network_device_types(id);


--
-- Name: network_devices network_devices_rack_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.network_devices
    ADD CONSTRAINT network_devices_rack_id_fkey FOREIGN KEY (rack_id) REFERENCES public.racks(id);


--
-- Name: network_devices network_devices_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.network_devices
    ADD CONSTRAINT network_devices_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id);


--
-- Name: network_devices network_devices_subtype_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.network_devices
    ADD CONSTRAINT network_devices_subtype_id_fkey FOREIGN KEY (subtype_id) REFERENCES public.network_subtypes(id);


--
-- Name: patch_panel_ports patch_panel_ports_patch_panel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.patch_panel_ports
    ADD CONSTRAINT patch_panel_ports_patch_panel_id_fkey FOREIGN KEY (patch_panel_id) REFERENCES public.patch_panels(id);


--
-- Name: patch_panels patch_panels_rack_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.patch_panels
    ADD CONSTRAINT patch_panels_rack_id_fkey FOREIGN KEY (rack_id) REFERENCES public.racks(id);


--
-- Name: physical_servers physical_servers_brand_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.physical_servers
    ADD CONSTRAINT physical_servers_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id);


--
-- Name: physical_servers physical_servers_cluster_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.physical_servers
    ADD CONSTRAINT physical_servers_cluster_type_id_fkey FOREIGN KEY (cluster_type_id) REFERENCES public.cluster_types(id);


--
-- Name: physical_servers physical_servers_device_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.physical_servers
    ADD CONSTRAINT physical_servers_device_type_id_fkey FOREIGN KEY (device_type_id) REFERENCES public.compute_device_types(id);


--
-- Name: physical_servers physical_servers_os_family_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.physical_servers
    ADD CONSTRAINT physical_servers_os_family_id_fkey FOREIGN KEY (os_family_id) REFERENCES public.os_families(id);


--
-- Name: physical_servers physical_servers_os_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.physical_servers
    ADD CONSTRAINT physical_servers_os_version_id_fkey FOREIGN KEY (os_version_id) REFERENCES public.os_versions(id);


--
-- Name: physical_servers physical_servers_rack_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.physical_servers
    ADD CONSTRAINT physical_servers_rack_id_fkey FOREIGN KEY (rack_id) REFERENCES public.racks(id);


--
-- Name: physical_servers physical_servers_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.physical_servers
    ADD CONSTRAINT physical_servers_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.device_roles(id);


--
-- Name: physical_servers physical_servers_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.physical_servers
    ADD CONSTRAINT physical_servers_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id);


--
-- Name: power_devices power_devices_device_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.power_devices
    ADD CONSTRAINT power_devices_device_type_id_fkey FOREIGN KEY (device_type_id) REFERENCES public.power_device_types(id);


--
-- Name: power_devices power_devices_rack_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.power_devices
    ADD CONSTRAINT power_devices_rack_id_fkey FOREIGN KEY (rack_id) REFERENCES public.racks(id);


--
-- Name: power_devices power_devices_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.power_devices
    ADD CONSTRAINT power_devices_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id);


--
-- Name: power_outlets power_outlets_power_device_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.power_outlets
    ADD CONSTRAINT power_outlets_power_device_id_fkey FOREIGN KEY (power_device_id) REFERENCES public.power_devices(id);


--
-- Name: power_outlets power_outlets_rack_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.power_outlets
    ADD CONSTRAINT power_outlets_rack_id_fkey FOREIGN KEY (rack_id) REFERENCES public.racks(id);


--
-- Name: power_outlets power_outlets_section_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.power_outlets
    ADD CONSTRAINT power_outlets_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.sections(id);


--
-- Name: power_outlets power_outlets_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.power_outlets
    ADD CONSTRAINT power_outlets_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id);


--
-- Name: rack_units rack_units_rack_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.rack_units
    ADD CONSTRAINT rack_units_rack_id_fkey FOREIGN KEY (rack_id) REFERENCES public.racks(id);


--
-- Name: racks racks_datacenter_floor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.racks
    ADD CONSTRAINT racks_datacenter_floor_id_fkey FOREIGN KEY (datacenter_floor_id) REFERENCES public.datacenter_floors(id);


--
-- Name: racks racks_rack_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.racks
    ADD CONSTRAINT racks_rack_type_id_fkey FOREIGN KEY (rack_type_id) REFERENCES public.rack_types(id);


--
-- Name: racks racks_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.racks
    ADD CONSTRAINT racks_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.rooms(id);


--
-- Name: racks racks_section_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.racks
    ADD CONSTRAINT racks_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.sections(id);


--
-- Name: racks racks_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.racks
    ADD CONSTRAINT racks_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id);


--
-- Name: rooms rooms_datacenter_floor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.rooms
    ADD CONSTRAINT rooms_datacenter_floor_id_fkey FOREIGN KEY (datacenter_floor_id) REFERENCES public.datacenter_floors(id);


--
-- Name: sections sections_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.sections
    ADD CONSTRAINT sections_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.rooms(id);


--
-- Name: sites sites_building_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.sites
    ADD CONSTRAINT sites_building_id_fkey FOREIGN KEY (building_id) REFERENCES public.buildings(id);


--
-- Name: sites sites_campus_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.sites
    ADD CONSTRAINT sites_campus_id_fkey FOREIGN KEY (campus_id) REFERENCES public.campuses(id);


--
-- Name: sites sites_cloud_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.sites
    ADD CONSTRAINT sites_cloud_id_fkey FOREIGN KEY (cloud_id) REFERENCES public.clouds(id);


--
-- Name: sites sites_floor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.sites
    ADD CONSTRAINT sites_floor_id_fkey FOREIGN KEY (floor_id) REFERENCES public.naming_floors(id);


--
-- Name: sites sites_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.sites
    ADD CONSTRAINT sites_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: sites sites_region_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.sites
    ADD CONSTRAINT sites_region_id_fkey FOREIGN KEY (region_id) REFERENCES public.regions(id);


--
-- Name: sites sites_section_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.sites
    ADD CONSTRAINT sites_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.naming_sections(id);


--
-- Name: sites sites_site_address_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.sites
    ADD CONSTRAINT sites_site_address_id_fkey FOREIGN KEY (site_address_id) REFERENCES public.site_addresses(id);


--
-- Name: subnet_role_assignments subnet_role_assignments_subnet_ipv4_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.subnet_role_assignments
    ADD CONSTRAINT subnet_role_assignments_subnet_ipv4_id_fkey FOREIGN KEY (subnet_ipv4_id) REFERENCES public.subnets_ipv4(id);


--
-- Name: subnet_role_assignments subnet_role_assignments_subnet_ipv6_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.subnet_role_assignments
    ADD CONSTRAINT subnet_role_assignments_subnet_ipv6_id_fkey FOREIGN KEY (subnet_ipv6_id) REFERENCES public.subnets_ipv6(id);


--
-- Name: subnets_ipv4 subnets_ipv4_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.subnets_ipv4
    ADD CONSTRAINT subnets_ipv4_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id);


--
-- Name: subnets_ipv4 subnets_ipv4_vlan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.subnets_ipv4
    ADD CONSTRAINT subnets_ipv4_vlan_id_fkey FOREIGN KEY (vlan_id) REFERENCES public.vlans(id);


--
-- Name: subnets_ipv6 subnets_ipv6_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.subnets_ipv6
    ADD CONSTRAINT subnets_ipv6_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id);


--
-- Name: subnets_ipv6 subnets_ipv6_vlan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.subnets_ipv6
    ADD CONSTRAINT subnets_ipv6_vlan_id_fkey FOREIGN KEY (vlan_id) REFERENCES public.vlans(id);


--
-- Name: virtual_machines virtual_machines_cluster_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.virtual_machines
    ADD CONSTRAINT virtual_machines_cluster_type_id_fkey FOREIGN KEY (cluster_type_id) REFERENCES public.cluster_types(id);


--
-- Name: virtual_machines virtual_machines_host_server_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.virtual_machines
    ADD CONSTRAINT virtual_machines_host_server_id_fkey FOREIGN KEY (host_server_id) REFERENCES public.physical_servers(id);


--
-- Name: virtual_machines virtual_machines_os_family_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.virtual_machines
    ADD CONSTRAINT virtual_machines_os_family_id_fkey FOREIGN KEY (os_family_id) REFERENCES public.os_families(id);


--
-- Name: virtual_machines virtual_machines_os_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.virtual_machines
    ADD CONSTRAINT virtual_machines_os_version_id_fkey FOREIGN KEY (os_version_id) REFERENCES public.os_versions(id);


--
-- Name: virtual_machines virtual_machines_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.virtual_machines
    ADD CONSTRAINT virtual_machines_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.device_roles(id);


--
-- Name: virtual_machines virtual_machines_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.virtual_machines
    ADD CONSTRAINT virtual_machines_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id);


--
-- Name: vlans vlans_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.vlans
    ADD CONSTRAINT vlans_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id);


--
-- Name: workstations workstations_brand_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.workstations
    ADD CONSTRAINT workstations_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id);


--
-- Name: workstations workstations_device_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.workstations
    ADD CONSTRAINT workstations_device_type_id_fkey FOREIGN KEY (device_type_id) REFERENCES public.compute_device_types(id);


--
-- Name: workstations workstations_os_family_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.workstations
    ADD CONSTRAINT workstations_os_family_id_fkey FOREIGN KEY (os_family_id) REFERENCES public.os_families(id);


--
-- Name: workstations workstations_os_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.workstations
    ADD CONSTRAINT workstations_os_version_id_fkey FOREIGN KEY (os_version_id) REFERENCES public.os_versions(id);


--
-- Name: workstations workstations_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.workstations
    ADD CONSTRAINT workstations_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.device_roles(id);


--
-- Name: workstations workstations_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vfcmdb
--

ALTER TABLE ONLY public.workstations
    ADD CONSTRAINT workstations_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id);


--
-- PostgreSQL database dump complete
--

\unrestrict htNC0o0sLohPdbpSo8lzwKVPgqB76VjitQeyjpnTouidrdceBVnlupRPbt6fIKj

