SHELL=/bin/sh
PWD=$(shell pwd)
BASE_DIR=$(shell pwd | sed -e 's/src$$//g')

CC = /usr/bin/gcc
CXX = /usr/bin/g++
LD = /usr/bin/ld
CP = cp -r -f
RM = rm -f
MD = mkdir -p
RD = rmdir

#------------------------------------------------------------------------------
PROGRAM_NAME        = data_manager
SOURCE_DIR          = ${BASE_DIR}/src
PREFIX              = /usr/service

#------------------------------------------------------------------------------
all:
	@echo "This use only install option"

install:
	${MD} ${DESTDIR}${PREFIX}
	${MD} ${DESTDIR}${PREFIX}/bin
	${MD} ${DESTDIR}${PREFIX}/etc
	${MD} ${DESTDIR}${PREFIX}/bin/node/
	${MD} ${DESTDIR}${PREFIX}/bin/node/transcode/
	${MD} ${DESTDIR}${PREFIX}/bin/node/transcode/data_manager/
	${MD} ${DESTDIR}${PREFIX}/bin/node/transcode/data_manager/js
	${MD} ${DESTDIR}${PREFIX}/bin/node/transcode/data_manager/routes
	${CP} data_manager.js           ${DESTDIR}${PREFIX}/bin/node/transcode/data_manager/
	${CP} listen.js                 ${DESTDIR}${PREFIX}/bin/node/transcode/data_manager/
	${CP} js/Api.js                 ${DESTDIR}${PREFIX}/bin/node/transcode/data_manager/js/
	${CP} js/Dbdata.js              ${DESTDIR}${PREFIX}/bin/node/transcode/data_manager/js/
	${CP} js/job.js                 ${DESTDIR}${PREFIX}/bin/node/transcode/data_manager/js/
	${CP} js/job_creator.js         ${DESTDIR}${PREFIX}/bin/node/transcode/data_manager/js/
	${CP} js/job_reporter.js        ${DESTDIR}${PREFIX}/bin/node/transcode/data_manager/js/
	${CP} js/logger.js              ${DESTDIR}${PREFIX}/bin/node/transcode/data_manager/js/
	${CP} js/util.js                ${DESTDIR}${PREFIX}/bin/node/transcode/data_manager/js/
	${CP} routes/index.js           ${DESTDIR}${PREFIX}/bin/node/transcode/data_manager/routes/
	${CP} data_manager.json         ${DESTDIR}${PREFIX}/etc/transcode_data_manager.json
	${CP} package.json              ${DESTDIR}${PREFIX}/bin/node/transcode/data_manager/
	${CP} node_modules.tar.gz       ${DESTDIR}${PREFIX}/bin/node/transcode/data_manager/
	${CP} manager.db.sql            ${DESTDIR}${PREFIX}/bin/node/transcode/data_manager/
	${CP} tagstory_data_manager.js	${DESTDIR}${PREFIX}/bin/node/transcode/data_manager/
	${CP} thumbnail_data_manager.js	${DESTDIR}${PREFIX}/bin/node/transcode/data_manager/
	${CP} tagstory_transcode_data_manager.json	${DESTDIR}${PREFIX}/etc/

#clean:
#	${RM} ${OBJS} ${PROGRAM_NAME} version.c

