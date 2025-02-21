workspace "Intaker" "A Django (python) web application for form data collection and curation " {

    !identifiers hierarchical
    # !docs readme

    model {

        groundops = element "GroundOps" "" "" groundopstag {
            # intaker -> groundops
        }

        # googlesheets = softwareSystem "Google Sheets" "data access and management" googlesheetstag

        # surveymonkey = softwareSystem "Survey Monkey" "subscription based survey tool" surveymonkeytag {
        #     -> googlesheets connector
        # }

        # googleforms = softwareSystem "Google Forms" "form-driven data intake" googleformstag {
        #     -> googlesheets connected
        # }
        email_service = softwareSystem "email" "Azure Communications Service" emailservice_tag {
            -> groundops "email" "" email2groundopstag
        }
        takserver = softwareSystem "CivTAK Server" "Team Awareness Kit" takservertag {
            events = container "events"
            -> groundops ATAK "" send2ataktag
        }
        azure_maps = softwareSystem "Azure Maps" "" azuremapstag

        informs = softwareSystem "InForms" "custom web app (django)" informstag {
            # container <name> [description] [technology] [tags]
            forms = container "Intake Forms" "data collection" "web-forms" intakeformstag {
                groundops -> this "Updates" "" groundops2forms
            }
            db = container "Intake Database" "data retention" database intakedbtag
            curate = container "Curation" "curation logic" application intakecuratetag {
                -> azure_maps
            }
            dispatch = container "Dispatch" "notification" application intakedispatchtag {
                -> takserver "COT" "" send2taktag
                -> email_service "notify" "" sendemailtag
            }
        }


        dispatchops = element "DispatchOps" "" "" dispatchopstag {
            # -> googleforms "form admin" "browser" dispatch2googleformstag
            # -> groundops "vetted info" "comm channel" dispatch2groundopstag
            # -> googlesheets "curate input" "browser" dispatch2googlesheetstag
            # -> surveymonkey "form admin" "browser" dispatch2surveymonkeytag
            -> informs.forms "admin" "" dispatch2intakeformstag
            -> informs.curate "curate" "" dispatch2intakecuratetag
            -> informs.dispatch "dispatch" "" dispatch2intakedispatchtag
        }

    }
    views {
        # systemContext googlesheets "GoogleSheets" {
        #     include *
        #     include groundops
        # }

        systemContext informs "InFormsCustomApp" {
            include *
            # include intakeforms
            # include intakedispatch
            # include intakecurate
            include groundops
        }

        # container <software system identifier> [key] [description] {
        #     ...
        # }
        container informs informsview "InForms - Custom Web App" {
            include *
            include groundops
            include dispatchops
            # autolayout lr
        }

        styles {
            relationship "Relationship" {
                # color green
                # dashed false
                fontSize 36
                thickness 3
            }
            # element googleformstag {
            #     background plum
            #     color black
            #     # fontSize 18
            #     shape WebBrowser
            #     icon icons/google-forms.png
            # }
            # element surveymonkeytag {
            #     background thistle
            #     color black
            #     # fontSize 18
            #     shape WebBrowser
            #     icon icons/surveymonkey_icon.png
            # }
            # element googlesheetstag {
            #     // from surveyor header
            #     background lightgreen
            #     color black
            #     # fontSize 18
            #     shape Cylinder
            #     icon icons/google-sheets.png
            # }
            element takservertag {
                shape ellipse
                background #FFFACD
                color black
                fontSize 18
                icon icons/tak_gov.png
                height 200
                width 300
            }
            element emailservice_tag {
                shape ellipse
                background #87CEFA
                color black
                fontSize 18
                icon icons/email_icon.png
                height 200
                width 300
            }
            element dispatchopstag {
                shape person
                background #8FBC8F
                icon icons/mic-fill-red.png
            }
            element groundopstag {
                shape person
                background #DAA520
                #AB4B52
                # background #DC143C
                icon icons/life-preserver_red.png
            }
            element informstag {
                background #0a1856
                color white
                shape RoundedBox
                icon icons/informs_icon.png
            }
            element intakeformstag {
                # background orchid
                background #0a1856
                color white
                # fontSize 18
                shape Pipe
                # icon icons/google-sheets.png
                icon icons/informs_icon.png
            }
            element intakedbtag {
                background lightgreen
                color black
                # fontSize 18
                shape Cylinder
                # icon icons/google-sheets.png
            }
            element intakecuratetag {
                background yellow
                color black
                # fontSize 18
                shape RoundedBox
                # icon icons/google-sheets.png
            }
            element intakedispatchtag {
                background lightcoral
                color black
                # fontSize 18
                shape Pipe
                # icon icons/google-sheets.png
            }
        }
    }
}


#         surveyor = softwareSystem "RF Field Surveyor" "RF Coverage" webapptag {
#             group ComposeNginx {
#                 nginx = container "Nginx" "Web Server\nSSL Proxy" "Docker" nginxtag
#             }
#             group ComposeSurveyor {
#                 database = container "SQLite3" "Database" "text" databasetag
#                 redis = container "Redis" "Cache" "Docker" redistag
#                 webapp = container "Surveyor" "Django/Python" "Docker" webapptag {
#                     nginx -> this gunicorn
#                     -> database
#                     -> redis set jobs
#                     -> redis get results
#                 }
#                 worker = container "Surveyor_Worker" "Django/Python" "Docker" workertag {
#                     -> redis get jobs
#                     -> redis set results
#                     -> database
#                 }
#             }
#             staticfiles = container "Static Files" "" "" staticfilestag {
#                 nginx -> this "static\nfiles"
#             }
#         }

#         influxdb = softwareSystem "InfluxDB" "a time-series database" influxdbtag {
#             organization = group "Influx Organization" {
#                 source = container "Influx Bucket" "data store" "bucket" influxbuckettag {
#                     measurement = component "Influx Measurement" " " "table" influxmeastag
#                     surveyor.webapp -> this query
#                     surveyor.worker -> this query
#                 }
#             }
#         }

#         fieldtech = person "Field Technician" "Field Technician" fieldtechtag {
#             -> surveyor.nginx "Web Access" "https" webaccessreltag
#         }

#         deploymentEnvironment Dev {
#             deploymentNode iotdash-dev-surveyor "Surveyor" "development linux vm" Ubuntu22.04 {
#                 # surveyor1 = softwareSystemInstance surveyor [] surveyor1tag
#                 suveyor1_webapp = containerInstance surveyor.webapp
#                 surveyor1_worker = containerInstance surveyor.worker
#                 surveyor1_nginx = containerInstance surveyor.nginx
#                 surveyor1_database = containerInstance surveyor.database
#                 surveyor1_redis = containerInstance surveyor.redis
#             }
#         }

#         deploymentEnvironment QA {
#             deploymentNode iotdash-qa-surveyor "Surveyor" "QA Linux VM" Ubuntu22.04 {
#                 # surveyor1 = softwareSystemInstance surveyor [] surveyor1tag
#                 suveyor2_webapp = containerInstance surveyor.webapp
#                 surveyor2_worker = containerInstance surveyor.worker
#                 surveyor2_nginx = containerInstance surveyor.nginx
#                 surveyor2_database = containerInstance surveyor.database
#                 surveyor2_redis = containerInstance surveyor.redis
#             }
#         }

#         deploymentEnvironment Prod {
#             deploymentNode iotdash-prod-surveyor "Surveyor" "Production Linux VM" Ubuntu22.04 {
#                 suveyor_webapp = containerInstance surveyor.webapp
#                 surveyor_worker = containerInstance surveyor.worker
#                 surveyor_nginx = containerInstance surveyor.nginx
#                 surveyor_database = containerInstance surveyor.database
#                 surveyor_redis = containerInstance surveyor.redis
#             }
#         }
#         deploymentEnvironment Brazil-QA {
#             deploymentNode iotdash-qa-surveyorbrazil "Surveyor" "Production Linux VM" Ubuntu22.04 {
#                 softwareSystemInstance surveyor "" surveyortag {
#                 # suveyor_webapp = containerInstance surveyor.webapp
#                 # surveyor_worker = containerInstance surveyor.worker
#                 # surveyor_nginx = containerInstance surveyor.nginx
#                 # surveyor_database = containerInstance surveyor.database
#                 # surveyor_redis = containerInstance surveyor.redis
#                 }
#             }
#         }
#     }

#     views {

#         container surveyor RFFieldSurveyor "RF Field Surveyor" {
#             include *
#         }
#         container influxdb "InfluxDB" "InfluxDB - Time Series Database" {
#             include *
#         }
#         deployment surveyor Dev surveyor1_view "Surveyor1 - Development" {
#             include *
#         }
#         deployment surveyor QA surveyor2_view "Surveyor2 - QA" {
#             include *
#         }
#         deployment surveyor Prod surveyor_view "Surveyor - Production" {
#             include *

#         }


#             element webapptag {
#                 // from surveyor header
#                 background #2f3067
#                 color white
#                 fontSize 24
#                 shape WebBrowser
#                 icon docs/icons/surveyor50b.png
#             }

#             element workertag {
#                 // from surveyor header
#                 background #5156b9
#                 color white
#                 icon docs/icons/surveyor50b.png
#             }

#             element databasetag {
#                 background #84cef4
#                 color #ffffff
#                 height 250
#                 width 250
#                 shape Cylinder
#                 icon docs/icons/sqlite_icon.png
#             }
#             element redistag {
#                 background #ff6156
#                 height 250
#                 width 250
#                 shape Pipe
#                 icon docs/icons/redis_icon.png
#             }
#             element nginxtag {
#                 background #00e95e
#                 height 250
#                 width 250
#                 shape Ellipse
#                 icon docs/icons/nginx_icon.png
#             }
#             element staticfilestag {
#                 background #efe4c6
#                 height 200
#                 width 200
#                 fontsize 18
#                 shape Folder
#                 icon docs/icons/documents_icon.png
#             }
#             element influxdbtag {
#                 background #9394FF
#                 shape Cylinder
#                 icon docs/icons/influxdb_icon.png
#             }
#             element influxbuckettag {
#                 background #5efff7
#                 shape Cylinder
#                 icon docs/icons/bucket_icon.png
#             }
#             element fieldtechtag {
#                 background plum
#                 shape Robot
#             }
#         }
#     }

# }
