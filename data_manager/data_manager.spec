# package에 포함되지 않은 파일이 있을 경우 빌드를 멈추지 않는다.
#%define _unpackaged_files_terminate_build 0
# DOC 파일이 누락되었을 경우에도 빌드를 멈추지 않는다.                                                                              
#%define _missing_doc_files_terminate_build 0
# debuginfo 패키지를 만들지 않는다.
%define debug_package %{nil}
# strip 을 하지 않는다.
%define __spec_install_post %{nil}

%define is_redhat %(test -e /etc/redhat-release && echo 1 || echo 0)
%define is_fedora %(test -e /etc/fedora-release && echo 1 || echo 0)

%define revision 5

Name:           transcode-data-manager
Summary:        Data Manager
Version:        2.1.0
Release:        %{revision}%{?dist}
License:        Private
Vendor:         Solution Box, Inc.
URL:            http://www.solbox.com
BuildArch:      noarch
BuildRoot:      %{_tmppath}/%{name}-%{version}-%{release}-build
Source0:        %{name}-%{version}.tar.gz
Group:          Application

%description
.

%prep
echo Building %{name}-%{version}-%{release}

%setup -q -n %{name}-%{version}

%build
#make clean -C src
#make "VERSION_STRING='${VERSION} (${Release})'" clean all
#make all -C src

%install
[ ${RPM_BUILD_ROOT} != "/" ] && rm -rf ${RPM_BUILD_ROOT}
make DESTDIR=${RPM_BUILD_ROOT} install

%clean
[ ${RPM_BUILD_ROOT} != "/" ] && rm -rf ${RPM_BUILD_ROOT}

%pre
#mkdir -p /usr/service/bin/node/transcode/data_manager
#mkdir -p /usr/service/etc/
mkdir -p /usr/service/logs/data_manager

%post
cd /usr/service/bin/node/transcode/data_manager; tar xfz node_modules.tar.gz

%preun
if [ "$1" == "0" ]
then
    cd /usr/service/bin/node/transcode/data_manager; npm stop; npm uninstall `ls node_modules`
fi

%postun
if [ "$1" == "0" ]
then
    rmdir --ignore-fail-on-non-empty /usr/service/bin/node/transcode/data_manager
    rmdir --ignore-fail-on-non-empty /usr/service/bin/node/transcode
    rmdir --ignore-fail-on-non-empty /usr/service/bin/node
    rmdir --ignore-fail-on-non-empty /usr/service/logs/data_manager
    rmdir --ignore-fail-on-non-empty /usr/service/logs
fi

%files
%defattr(-,root,root)
/usr/service/bin/node/transcode/data_manager/
#/usr/service/bin/node/transcode/data_manager/Api.js
#/usr/service/bin/node/transcode/data_manager/Dbdata.js
#/usr/service/bin/node/transcode/data_manager/logger.js
#/usr/service/bin/node/transcode/data_manager/data_manager.js
#/usr/service/bin/node/transcode/data_manager/package.json
#/usr/service/bin/node/transcode/data_manager/node_modules.tar.gz
#/usr/service/bin/node/transcode/data_manager/manager.db.sql
#/usr/service/bin/node/transcode/data_manager/tagstory_data_manager.js
#/usr/service/bin/node/transcode/data_manager/thumbnail_data_manager.js 
%config(noreplace) /usr/service/etc/transcode_data_manager.json
%config(noreplace) /usr/service/etc/tagstory_transcode_data_manager.json

